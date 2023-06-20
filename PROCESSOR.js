class BytebeatProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [];
    }

    constructor(...a) {
        super(...a);
        this.isPlaying = this.reset = false;
        this.sampleContextRate = sampleRate;
        this.rate = 8000;
        this.t = 0;
        this.subt = 0;
        this.last = 0;
        this.savedSamples = [];
        this.windowState = 2;
        this.func = (t) => (
            (t << 1 & t * 3 & -t >> 5 & t >> 11) - 1
        )

        this.port.onmessage = (e) => this.receiveData(e)
        console.log(this.sampleContextRate, sampleRate, this.rate)
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const tOut = []


        for (let channel = 0; channel < output.length; ++channel) {
            const outputChannel = output[channel];

            for (let i = 0; i < outputChannel.length; ++i) {
                if ((this.subt < 1) || (this.rate > this.sampleContextRate)) {
                    let byte = (this.last+1)*127.5;
                    const out = this.func(Math.floor(this.t))
                    try { byte = (isNaN(out[0]??out)?((this.last+1)*127.5):+(out[0]??out)) & 255 }
                    catch(e) {this.sendData({runtimeError: {place: this.t, message: e.message || `[[[throw]]] ${e}`}})}
                    this.last = isNaN(+byte)?this.last:(byte / 127.5 - 1); // Normalize to [-1, 1]
                    tOut.push(this.last)
                    this.t+=Math.max(1,this.rate/this.sampleContextRate)
                }
                outputChannel[i] = this.last
                this.subt = (this.subt + 1) % (this.sampleContextRate / this.rate);
            }
        }


        for (let i = 0; i < tOut.length; i++) {
            this.savedSamples.push(tOut[i])
            if (this.savedSamples.length == ((this.windowState==2)?((this.rate>16000)?1024:512):2048) || this.savedSamples.length>2047) {
                if(this.windowState!==0) this.sendData({ samples: this.savedSamples })
                this.savedSamples = [];
            }
        }

        return true;
    }

    receiveData(e) {
        const { data } = e
        if (data.function) {
            const old = this.func

            const mathNames = Object.getOwnPropertyNames(Math)
            const MathFuncs = mathNames.map(e => Math[e])

            mathNames.push('int', 'float', 'long', 'window')
            MathFuncs.push(Math.floor, (x) => (x), Math.floor, globalThis)

            try {
                this.func = new Function(...mathNames, 't', `return 0, ${data.function || 0}\n;`)
                    .bind(globalThis, ...MathFuncs)

                this.rate = +((data.function.match(/(?<=\/\/rate:\s?)\d+(?=\n|\r\n|$)/g) ?? [8000])[0])
            } catch(e) {
                this.sendData({creationError: e.message})
                this.func = old;
            }
            try{
                this.func(0);
            } catch(e) {
                this.sendData({runtimeError: {place: 0, message: e.message}})
            }
        }
        if (data.reset) {
            this.reset = true
            this.t = this.subt = this.last = 0;
            this.savedSamples = [];
        }
        if(data.windowState !== undefined) {
            this.windowState = data.windowState;
        }
        //console.log(data)
    }

    sendData(data) {
        this.port.postMessage(data);
    }
}

// Register the Audio Worklet processor
registerProcessor('bytebeat-processor', BytebeatProcessor);  