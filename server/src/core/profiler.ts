import {logger} from "./logger";

export class Profiler {
    private start: number;

    public constructor() {
        this.start = performance.now();
    }

    public mark(description: string) {
        // const buffer_28 = 28;
        // const message = `${this.name} | ${description}`;
        // tracer.verbose(`${message.padEnd(buffer_28)}: ${performance.now() - this.start} ms`);

        logger.verbose(`${description} : ${performance.now() - this.start} ms`);

        this.start = performance.now();
    }
}
