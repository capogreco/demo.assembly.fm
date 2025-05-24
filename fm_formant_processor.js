class FMFormantProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.sampleRate = sampleRate
        this.phase = 0.0
        this.formants = [
            {freq: 700, amp: 1.0, bw: 0.1},
            {freq: 1220, amp: 0.6, bw: 0.1},
            {freq: 2600, amp: 0.3, bw: 0.1},
            {freq: 3300, amp: 0.1, bw: 0.1}
        ]
        this.active = false
        
        // Set up message handler for discrete events
        this.port.onmessage = (event) => {
            const data = event.data

            if (data.type === 'param') {
                if (data.name === 'active') {
                    this.active = data.value
                } else if (data.type === 'updateFormants') {
                    // Formant updates will come with target values and ramp time
                    this.targetFormants = data.formants
                }
            }
        }
    }

    static get parameterDescriptors() {
        const params = [
            {
                name: 'frequency',
                defaultValue: 220,
                minValue: 20,
                maxValue: 20000,
                automationRate: 'a-rate'
            },
            {
                name: 'gain',
                defaultValue: 0.1,
                minValue: 0,
                maxValue: 1,
                automationRate: 'a-rate'
            }
        ]
        
        // Add parameters for 4 formants
        for (let i = 0; i < 4; i++) {
            params.push({
                name: `formant${i}_freq`,
                defaultValue: [700, 1220, 2600, 3300][i],
                minValue: 50,
                maxValue: 5000,
                automationRate: 'a-rate'
            })
            params.push({
                name: `formant${i}_amp`,
                defaultValue: [1.0, 0.6, 0.3, 0.1][i],
                minValue: 0,
                maxValue: 1,
                automationRate: 'a-rate'
            })
            params.push({
                name: `formant${i}_bw`,
                defaultValue: 0.1,
                minValue: 0.01,
                maxValue: 0.5,
                automationRate: 'a-rate'
            })
        }
        
        return params
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0]
        const channel = output[0]

        if (!this.active) {
            for (let i = 0; i < channel.length; i++) {
                channel[i] = 0
            }
            return true
        }

        // Get parameter values (either per-sample or use first value)
        const frequencies = parameters.frequency
        const gains = parameters.gain
        const useFrequencyArray = frequencies.length > 1
        const useGainArray = gains.length > 1

        for (let i = 0; i < channel.length; i++) {
            // Get current frequency from AudioParam
            const fundamentalFreq = useFrequencyArray ? frequencies[i] : frequencies[0]
            const gain = useGainArray ? gains[i] : gains[0]
            
            // Update shared phasor
            const phaseIncrement = fundamentalFreq / this.sampleRate
            this.phase = (this.phase + phaseIncrement) % 1.0

            // Generate modulator signal
            const modulator = Math.sin(2 * Math.PI * this.phase)

            let sample = 0

            // Process each formant using AudioParam values
            for (let f = 0; f < 4; f++) {
                const formantFreq = parameters[`formant${f}_freq`]
                const formantAmp = parameters[`formant${f}_amp`]
                const formantBw = parameters[`formant${f}_bw`]
                
                const freq = formantFreq.length > 1 ? formantFreq[i] : formantFreq[0]
                const amp = formantAmp.length > 1 ? formantAmp[i] : formantAmp[0]
                const bw = formantBw.length > 1 ? formantBw[i] : formantBw[0]
                
                // Calculate carrier harmonic ratios
                const targetRatio = freq / fundamentalFreq
                const lowerHarmonic = Math.floor(targetRatio)
                const upperHarmonic = lowerHarmonic + 1

                // Determine even/odd assignment
                const lowerIsEven = lowerHarmonic % 2 === 0
                const evenHarmonic = lowerIsEven ? lowerHarmonic : upperHarmonic
                const oddHarmonic = lowerIsEven ? upperHarmonic : lowerHarmonic

                // Calculate cross-fade weights
                const fraction = targetRatio - lowerHarmonic
                const evenWeight = lowerIsEven ? (1 - fraction) : fraction
                const oddWeight = lowerIsEven ? fraction : (1 - fraction)

                // Generate carriers with FM
                const modIndex = bw * 2
                const modSignal = modulator * modIndex

                // Even carrier
                const evenPhase = (evenHarmonic * this.phase) % 1.0
                const evenCarrier = Math.sin(2 * Math.PI * evenPhase + modSignal)

                // Odd carrier
                const oddPhase = (oddHarmonic * this.phase) % 1.0
                const oddCarrier = Math.sin(2 * Math.PI * oddPhase + modSignal)

                // Mix carriers and apply formant amplitude
                sample += amp * (evenWeight * evenCarrier + oddWeight * oddCarrier)
            }

            channel[i] = sample * gain
        }

        return true
    }

    static getVowelFormants(vowelPosition) {
        // Comprehensive vowel formant data (frequency in Hz, amplitude in dB converted to linear)
        const vowelFormants = [
            // 'a' as in "father"
            {
                formants: [
                    {freq: 700, amp: 1.0, bw: 0.1},
                    {freq: 1220, amp: 0.5, bw: 0.1},
                    {freq: 2600, amp: 0.16, bw: 0.15},
                    {freq: 3300, amp: 0.1, bw: 0.2}
                ]
            },
            // 'e' as in "bed"
            {
                formants: [
                    {freq: 530, amp: 1.0, bw: 0.1},
                    {freq: 1840, amp: 0.32, bw: 0.15},
                    {freq: 2480, amp: 0.2, bw: 0.2},
                    {freq: 3520, amp: 0.1, bw: 0.2}
                ]
            },
            // 'i' as in "beet"
            {
                formants: [
                    {freq: 270, amp: 1.0, bw: 0.1},
                    {freq: 2290, amp: 0.25, bw: 0.2},
                    {freq: 3010, amp: 0.16, bw: 0.2},
                    {freq: 3300, amp: 0.1, bw: 0.2}
                ]
            },
            // 'o' as in "boat"
            {
                formants: [
                    {freq: 570, amp: 1.0, bw: 0.1},
                    {freq: 840, amp: 0.63, bw: 0.1},
                    {freq: 2410, amp: 0.1, bw: 0.2},
                    {freq: 3400, amp: 0.05, bw: 0.2}
                ]
            },
            // 'u' as in "boot"
            {
                formants: [
                    {freq: 300, amp: 1.0, bw: 0.1},
                    {freq: 870, amp: 0.32, bw: 0.1},
                    {freq: 2240, amp: 0.08, bw: 0.2},
                    {freq: 3400, amp: 0.04, bw: 0.2}
                ]
            }
        ]

        // Map position (0-1) to vowel space
        const scaledPos = vowelPosition * (vowelFormants.length - 1)
        const lowerIndex = Math.floor(scaledPos)
        const upperIndex = Math.min(lowerIndex + 1, vowelFormants.length - 1)
        const fraction = scaledPos - lowerIndex

        // Interpolate between adjacent vowels
        const lowerVowel = vowelFormants[lowerIndex].formants
        const upperVowel = vowelFormants[upperIndex].formants

        const interpolatedFormants = []
        for (let i = 0; i < 4; i++) {
            interpolatedFormants.push({
                freq: lowerVowel[i].freq + (upperVowel[i].freq - lowerVowel[i].freq) * fraction,
                amp: lowerVowel[i].amp + (upperVowel[i].amp - lowerVowel[i].amp) * fraction,
                bw: lowerVowel[i].bw + (upperVowel[i].bw - lowerVowel[i].bw) * fraction
            })
        }
        
        return interpolatedFormants
    }
}

registerProcessor('fm-formant-processor', FMFormantProcessor)