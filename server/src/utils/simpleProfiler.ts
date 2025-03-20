import * as fs from 'fs';

export class SimpleProfiler {
    private readonly _resultFile: string;
    private _sessionCount: number = 0;
    private _sessions: Array<{ elapsedTime: number; memoryUsed: number }> = [];
    private _startTime: number = 0;
    private _startMemory: number = 0;

    constructor(name: string) {
        this._resultFile = `${name}_${this.getTimestamp()}.txt`;
    }

    public beginSession(): void {
        this._startTime = Date.now();
        this._startMemory = process.memoryUsage().heapUsed;
    }

    public endSession(): void {
        const endTime = Date.now();
        const endMemory = process.memoryUsage().heapUsed;
        const elapsedTime = endTime - this._startTime;
        const memoryUsed = endMemory - this._startMemory;

        this._sessions.push({elapsedTime, memoryUsed});
        this._sessionCount++;
    }

    public outputResult(): void {
        let output = "Profiling Results:\n";

        this._sessions.forEach((session, index) => {
            output += `Session ${index + 1}: Elapsed Time: ${session.elapsedTime} ms, Memory Used: ${session.memoryUsed} bytes\n`;
        });

        const totalElapsedTime = this._sessions.reduce((acc, session) => acc + session.elapsedTime, 0);
        const totalMemoryUsed = this._sessions.reduce((acc, session) => acc + session.memoryUsed, 0);
        output += `Average: Elapsed Time: ${totalElapsedTime / this._sessionCount} ms, Memory Used: ${totalMemoryUsed / this._sessionCount} bytes\n`;

        fs.writeFileSync(this._resultFile, output, {encoding: 'utf8'});

        console.log(`Results written to ${this._resultFile}`);
    }

    private getTimestamp(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    }
}
