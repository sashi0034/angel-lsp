import assert = require("node:assert");

export enum AnalysisQueuePriority {
    Direct = 'Direct',
    Indirect = 'Indirect',
}

// Direct with reanalyzeDependents: true --- Added when the user directly edits a file
// Direct with reanalyzeDependents: false --- Added when the user edits an anonymous namespace in a file
// Indirect with reanalyzeDependents: true --- Elements affected by items in the direct queue
// Indirect with reanalyzeDependents: false --- By items in the indirect queue; these are the lowest-priority elements

interface RecordElement {
    uri: string;
}

interface QueueElement<Record extends RecordElement> {
    record: Record;
    reanalyzeDependents: boolean;
}

export class AnalysisQueue<Record extends RecordElement> {
    // Priority: directQueue >> indirectQueue >> lazyIndirectQueue

    // <file change> --> push directQueue
    // <element with reanalyzeDependents> --> push indirectQueue

    // Elements affected when a file is opened or modified by the user are added to this queue.
    private _directQueue: QueueElement<Record>[] = [];

    // Elements affected by changes in the direct elements are added to this queue.
    private _indirectQueue: QueueElement<Record>[] = [];

    // Elements that are indirectly affected and not currently of interest to the user are added to this queue.
    // private _lazyIndirectQueue: QueueElement<Record>[] = [];

    public clear() {
        this._directQueue = [];
        this._indirectQueue = [];
        // this._lazyIndirectQueue = [];
    }

    public hasDirect(): boolean {
        return this._directQueue.length > 0;
    }

    public hasIndirect(): boolean {
        return this._indirectQueue.length > 0;
    }

    public isInQueue(uri: string): boolean {
        return this._directQueue.some(r => r.record.uri === uri) ||
            this._indirectQueue.some(r => r.record.uri === uri);
    }

    /**
     * Push the record to the front of the direct queue.
     * This is used for urgent processing.
     */
    public frontPushDirect(record: QueueElement<Record>): void {
        this._directQueue = this._directQueue.filter(r => r.record.uri !== record.record.uri);
        this._directQueue.unshift(record);

        this._indirectQueue = this._indirectQueue.filter(r => r.record.uri !== record.record.uri);
    }

    public pushDirect(record: QueueElement<Record>): void {
        const foundInDirect = this._directQueue.find(r => r.record.uri === record.record.uri);
        if (foundInDirect !== undefined) {
            foundInDirect.reanalyzeDependents = foundInDirect.reanalyzeDependents || record.reanalyzeDependents;
        } else {
            this._directQueue.push(record);
        }

        this._indirectQueue = this._indirectQueue.filter(r => r.record.uri !== record.record.uri);
    }

    public pushIndirect(record: QueueElement<Record>): void {
        const foundInDirect = this._directQueue.find(r => r.record.uri === record.record.uri);
        if (foundInDirect !== undefined) {
            foundInDirect.reanalyzeDependents = foundInDirect.reanalyzeDependents || record.reanalyzeDependents;
            return;
        }

        const foundInIndirect = this._indirectQueue.find(r => r.record.uri === record.record.uri);
        if (foundInIndirect !== undefined) {
            foundInIndirect.reanalyzeDependents = foundInIndirect.reanalyzeDependents || record.reanalyzeDependents;
        } else {
            this._indirectQueue.push(record);
        }
    }

    public frontPop(): QueueElement<Record> & { queue: AnalysisQueuePriority } | undefined {
        if (this._directQueue.length > 0) {
            // console.log('** pop directQueue: ' + this._directQueue[0].record.uri);
            return {...this._directQueue.shift()!, queue: AnalysisQueuePriority.Direct};
        }

        if (this._indirectQueue.length > 0) {
            // console.log('*  pop indirectQueue');
            return {...this._indirectQueue.shift()!, queue: AnalysisQueuePriority.Indirect};
        }

        return undefined;
    }
}

