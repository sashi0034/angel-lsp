import assert = require("node:assert");

// export enum AnalysisQueuePriority {
//     Direct = 'Direct',
//     Indirect = 'Indirect',
//     LazyIndirect = 'LazyIndirect',
// }

interface RecordElement {
    uri: string;
    isOpen: boolean;
}

interface QueueElement<Record extends RecordElement> {
    record: Record;
    reanalyzeDependents?: boolean;
}

export class AnalysisQueue<Record extends RecordElement> {
    // Priority: directQueue >> indirectQueue >> lazyIndirectQueue

    // <file change> --> push directQueue
    // <directQueue element> --> push indirectQueue or lazyIndirectQueue

    // Elements affected when a file is opened or modified by the user are added to this queue.
    private _directQueue: QueueElement<Record>[] = [];

    // Elements affected by changes in the direct elements are added to this queue.
    private _indirectQueue: QueueElement<Record>[] = [];

    // Elements that are indirectly affected and not currently of interest to the user are added to this queue.
    private _lazyIndirectQueue: QueueElement<Record>[] = [];

    public clear() {
        this._directQueue = [];
        this._indirectQueue = [];
        this._lazyIndirectQueue = [];
    }

    public hasDirect(): boolean {
        return this._directQueue.length > 0;
    }

    public hasIndirect(): boolean {
        return this._indirectQueue.length > 0;
    }

    public hasLazyIndirect(): boolean {
        return this._lazyIndirectQueue.length > 0;
    }

    // public hasAny(): boolean {
    //     return this.hasDirect() || this.hasIndirect() || this.hasLazyIndirect();
    // }

    public isInQueue(uri: string): boolean {
        return this._directQueue.some(r => r.record.uri === uri) ||
            this._indirectQueue.some(r => r.record.uri === uri) ||
            this._lazyIndirectQueue.some(r => r.record.uri === uri);
    }

    /**
     * Push the record to the front of the direct queue.
     * This is used for urgent processing.
     */
    public frontPushDirect(record: QueueElement<Record>): void {
        this._directQueue = this._directQueue.filter(r => r.record.uri !== record.record.uri);
        this._directQueue.unshift(record);

        this._indirectQueue = this._indirectQueue.filter(r => r.record.uri !== record.record.uri);
        this._lazyIndirectQueue = this._lazyIndirectQueue.filter(r => r.record.uri !== record.record.uri);
    }

    public pushDirect(record: QueueElement<Record>): void {
        if (!this._directQueue.some(r => r.record.uri === record.record.uri)) {
            this._directQueue.push(record);
        }

        this._indirectQueue = this._indirectQueue.filter(r => r.record.uri !== record.record.uri);
        this._lazyIndirectQueue = this._lazyIndirectQueue.filter(r => r.record.uri !== record.record.uri);
    }

    public pushIndirect(record: QueueElement<Record>): void {
        assert(record.record.isOpen);

        if (this._directQueue.some(r => r.record.uri === record.record.uri)) {
            return;
        }

        if (!this._indirectQueue.some(r => r.record.uri === record.record.uri)) {
            this._indirectQueue.push(record);
        }

        this._lazyIndirectQueue = this._lazyIndirectQueue.filter(r => r.record.uri !== record.record.uri);
    }

    public pushLazyIndirect(record: QueueElement<Record>): void {
        assert(record.record.isOpen === false);

        if (this._directQueue.some(r => r.record.uri === record.record.uri)) {
            return;
        }

        if (this._indirectQueue.some(r => r.record.uri === record.record.uri)) {
            return;
        }

        if (!this._lazyIndirectQueue.some(r => r.record.uri === record.record.uri)) {
            this._lazyIndirectQueue.push(record);
        }
    }

    public frontPop(): QueueElement<Record> | undefined {
        if (this._directQueue.length > 0) {
            // console.log('*** pop directQueue: ' + this._directQueue[0].record.uri);
            return this._directQueue.shift()!;
        }

        this.refreshIndirectAndLazyIndirect();

        if (this._indirectQueue.length > 0) {
            // console.log('**  pop indirectQueue: ' + this._indirectQueue[0].record.uri);
            return this._indirectQueue.shift()!;
        }

        if (this._lazyIndirectQueue.length > 0) {
            // console.log('*   pop lazyIndirectQueue');
            return this._lazyIndirectQueue.shift()!;
        }

        return undefined;
    }

    private refreshIndirectAndLazyIndirect() {
        // Check if the file is closed and move it to the lazy indirect queue.
        for (let i = this._indirectQueue.length - 1; i >= 0; i--) {
            if (this._indirectQueue[i].record.isOpen) continue;

            this._lazyIndirectQueue.push(this._indirectQueue[i]);
            this._indirectQueue.splice(i, 1);
        }

        // Check if the file is opened and move it to the indirect queue.
        for (let i = this._lazyIndirectQueue.length - 1; i >= 0; i--) {
            if (this._lazyIndirectQueue[i].record.isOpen === false) continue;

            this._indirectQueue.push(this._lazyIndirectQueue[i]);
            this._lazyIndirectQueue.splice(i, 1);
        }
    }
}

