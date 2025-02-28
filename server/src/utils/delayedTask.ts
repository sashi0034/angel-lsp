/**
 * A class that allows for a task to be rescheduled with a delay.
 */
export class DelayedTask {
    private _timer: NodeJS.Timeout | undefined = undefined;

    public reschedule(callback: (args: void) => void, delay?: number) {
        if (this._timer !== undefined) {
            clearTimeout(this._timer);
        }

        this._timer = setTimeout(callback, delay);
    }

    public cancel() {
        if (this._timer !== undefined) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }
    }
}

