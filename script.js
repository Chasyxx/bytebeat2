document.querySelector('[noscr]').remove()

let canvas = document.querySelector("[entry-canvas]")
const CTX = canvas.getContext('2d', { willReadFrequently: true })

const playButton = document.querySelector('[play-button]')
const resetButton = document.querySelector('[reset-button]')
const regButton = document.querySelector('[register-button]')
const resetAndRegButton = document.querySelector('[register-and-reset-button]')
const code = document.querySelector('[input-area]')
const error = document.querySelector('[error]')

let box = 0;
const cW = canvas.width;
const cH = canvas.height;

const fftSize = cW << 1; // FFT size for spectrogram

const {hash} = window.location;

if(hash.startsWith('#BYTEBEATTHING_')){
    try {
    const subV = atob(hash.slice(15));
    const V = subV.replace(/([^][^])/g,(_match,p1)=>{return String.fromCharCode((p1.charCodeAt(0)<<8)+p1.charCodeAt(1))})
    console.log(V)
    code.value = V
    } catch (e) {
        console.error('URL error [[%s]]',e.stack)
    }
}

await new Promise(resolve => { playButton.addEventListener('click', async () => { resolve(); }) })

resetButton.disabled = regButton.disabled = resetAndRegButton.disabled = false

/*function GraphicsSystem(samples) {
    for (const sample of samples) {
        box = (box + 1) % boxLimit;
        const X = box % cW
        const Y = Math.floor(box / cW)

        const color = sample.toString(16)

        CTX.fillStyle = `#${color}${color}${color}`
        CTX.fillRect(X,Y,1,1)
    }
}*/

/*function GraphicsSystem(samples) {
    const imageData = CTX.getImageData(0, 0, cW, cH)

    // Shift existing image data to the left
    for (let y = 0; y < cH; y++) {
        const pixelOffset = (y * cW + samples.length) * 4;
        const startOffset = y * cW * 4;

        for (let i = startOffset; i < pixelOffset; i++) {
            imageData.data[i] = imageData.data[i + (samples.length * 4)];
        }
    }

    for (let i = 0; i < samples.length; i++) {
        const rgb = (samples[i] + 1) * 127.5
        const pixel = (((cH*(cW-1))-0)+i)<<2
        imageData.data[pixel] = rgb >> 2
        imageData.data[pixel + 1] = rgb >> 1
        imageData.data[pixel + 2] = rgb
        imageData.data[pixel + 3] = 255
    }

    CTX.putImageData(imageData, 0, 0);

    box = (box + samples.length) % cH;
}*/

playButton.disabled = true
playButton.innerText = "now playing"

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Register the Audio Worklet processor
await audioContext.audioWorklet.addModule('PROCESSOR.js');

// Create an AudioWorkletNode
const workletNode = new AudioWorkletNode(audioContext, 'bytebeat-processor');

const analyserNode = audioContext.createAnalyser();
analyserNode.fftSize = fftSize;
const bufferLength = analyserNode.frequencyBinCount;
const buffer = new Uint8Array(bufferLength);
analyserNode.getByteTimeDomainData(buffer);
workletNode.connect(analyserNode)

function GraphicsSystem(samples) {

    const imageData = CTX.getImageData(0, 0, cW, cH);
    const pixelData = imageData.data;
    const mode = +(document.querySelector('[visual-select]').value)

    for (let y = 0; y < cH; y++) { // Shift everything up
        const pixelOffset = ((y+1) * cW) * 4;
        const startOffset = y * cW * 4;

        for (let i = startOffset; i < pixelOffset; i++) {
            imageData.data[i] = imageData.data[i + (cW * 4)];
            
        }
    }

    // Compute spectrogram data
    analyserNode.getByteFrequencyData(buffer);

    // Draw on the bottom row
    for (let i = 0; i < cW; i++) {
        const value1 = buffer[i];
        const value2 = (samples[i]+1)*127.5;
        const pixelOffset = ((cH - 1) * cW + i)<<2;

        pixelData[pixelOffset] = (mode?value1:value2)>>2;
        pixelData[pixelOffset + 1] = (mode?value1:value2)>>1;
        pixelData[pixelOffset + 2] = (mode?value1:value2)>>0;
        pixelData[pixelOffset + 3] = 255;
    }

    if(samples.length>600 && !mode) {

        for (let y = 0; y < cH; y++) { // Shift everything up... again.
            const pixelOffset = ((y+1) * cW) * 4;
            const startOffset = y * cW * 4;
    
            for (let i = startOffset; i < pixelOffset; i++) {
                imageData.data[i] = imageData.data[i + (cW * 4)];
                
            }
        }

        for (let i = 0; i <cW; i++) {
            const value = ((samples[i+512]??1)+1)*127.5;
            const pixelOffset = ((cH - 1) * cW + i)<<2;
    
            pixelData[pixelOffset] = value>>2;
            pixelData[pixelOffset + 1] = value>>1;
            pixelData[pixelOffset + 2] = value>>0;
            pixelData[pixelOffset + 3] = 255;
        }

    }

    CTX.putImageData(imageData, 0, 0);
}

function sendData(data) {
    workletNode.port.postMessage(data);

    if(data.function) {
        let funct = data.function

        funct = funct.replace(/([^])/g,(_match,p1)=>{return String.fromCharCode(p1.charCodeAt(0)>>8,p1.charCodeAt(0)&255)})
        window.location.hash='#BYTEBEATTHING_' + btoa(funct).replace(/=/g,'')
    }
}

function receiveData(e) {
    const { data } = e
    if (data.samples !== undefined) {
        window.requestAnimationFrame((_timestamp) => GraphicsSystem(data.samples))
    }
    if(data.creationError) {
        error.innerText = data.creationError
    }
    if(data.runtimeError) {
        error.innerText = `  {{${data.runtimeError.place}}}:\n${data.runtimeError.message}`
    }
    // console.log(data)
}

function getFunction() {
    const string = code.value

    const mathNames = Object.getOwnPropertyNames(Math)
    const MathFuncs = mathNames.map(e => Math[e])

    mathNames.push('int', 'float', 'long', 'window')
    MathFuncs.push(Math.floor, (x) => (x), Math.floor, globalThis)

    const func = new Function(...mathNames, 't', `return 0, ${string || 0};`)
        .bind(globalThis, ...MathFuncs)
    return func
}

workletNode.port.onmessage = receiveData

resetButton.addEventListener('click', () => {
    sendData({ reset: true })
    box = 0;
    CTX.clearRect(0, 0, cW, cH)
})
regButton.addEventListener('click', () => {
    error.innerText = 'No Error'
    sendData({ function: code.value })
})
resetAndRegButton.addEventListener('click', () => {
    error.innerText = 'No Error'
    sendData({ function: code.value, reset: true })
    box = 0;
    CTX.clearRect(0, 0, cW, cH)
})

// Connect the workletNode to the audio output
workletNode.connect(audioContext.destination);

sendData({ function: code.value })

/*function ani() {
    window.requestAnimationFrame(ani)
    CTX.fillStyle = '#FFFFFF'
    CTX.fillRect(Math.floor(Math.random()*cW),Math.floor(Math.random()*cH),1,1)
}

window.requestAnimationFrame(ani)*/