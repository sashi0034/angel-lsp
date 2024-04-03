import {tracer} from "./tracer";

export class Profiler {
    private start: number;

    public constructor(private readonly name: string) {
        this.start = performance.now();
    }

    public stamp(description: string) {
        const buffer_28 = 28;
        const message = `${this.name} | ${description}`;
        tracer.verbose(`${message.padEnd(buffer_28)}: ${performance.now() - this.start} ms`);

        this.start = performance.now();
    }
}
