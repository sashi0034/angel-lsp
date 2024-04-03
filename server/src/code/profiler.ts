import {tracer} from "./tracer";

export class Profiler {
    private start: number;

    public constructor(private readonly name: string) {
        this.start = performance.now();
    }

    public stamp(description: string) {
        let message = `${this.name} | ${description}`;

        const space_4 = 4;
        const indent_6 = 6;
        const tab = Math.floor(((space_4 * indent_6 - 1) - message.length) / space_4);
        if (tab > 0) message += "\t".repeat(tab);

        tracer.verbose(`${message}: ${performance.now() - this.start} ms`);

        this.start = performance.now();
    }
}
