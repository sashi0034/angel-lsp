import {TextPosition} from "../../src/compiler_tokenizer/textLocation";
import {FileContentUnit} from "../inspectorUtils";
import {makeCaretListAndContent} from "./caretUtils";

interface CaretLocation {
    uri: string;
    position: TextPosition;
}

export class CaretMap {
    private readonly _map = new Map<number, CaretLocation>();

    public processFiles(fileContentList: FileContentUnit[]): CaretMap {
        for (const file of fileContentList) {
            const {caretList, actualContent} = makeCaretListAndContent(file.content);
            file.content = actualContent;
            this.append(file.uri, caretList);
        }

        return this;
    }

    private append(uri: string, carets: Map<number, TextPosition>) {
        carets.forEach((position, index) => {
            if (this._map.has(index)) {
                throw new Error(`Duplicated caret index: ${index}`);
            }

            this._map.set(index, {uri, position});
        });

        return this;
    }

    public get length(): number {
        return this._map.size;
    }

    public get(index: number): CaretLocation {
        const location = this._map.get(index);
        if (location === undefined) {
            throw new Error(`No caret found at index ${index}`);
        }

        return location;
    }
}
