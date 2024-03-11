import {runningRelease} from "./debug";

let s_start: number;

function restart() {
    if (runningRelease()) return;
    s_start = performance.now();
    console.log("------- Performance Profiling -------");
}

function stamp(message: string) {
    if (runningRelease()) return;
    const space_4 = 4;
    const indent_4 = 4;
    const tab = Math.floor(((space_4 * indent_4 - 1) - message.length) / space_4);
    if (tab > 0) message += "\t".repeat(tab);
    console.log(`${message}: ${performance.now() - s_start} ms`);
    s_start = performance.now();
}

export const profiler = {
    restart,
    stamp,
};
