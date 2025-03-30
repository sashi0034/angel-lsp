import {Inspector} from "../src/inspector/inspector";

export class InspectorTestEvent {
    private _onBegin: () => void = () => {
    };

    public onBegin(callback: () => void): InspectorTestEvent {
        this._onBegin = callback;
        return this;
    }

    public begin() {
        this._onBegin();
    }
}

export interface FileContentUnit {
    uri: string;
    content: string;
}

export type FileContents = string | FileContentUnit[];

export function isRawContent(fileContent: FileContents): fileContent is string {
    return typeof fileContent === "string";
}

const defaultTargetUri = 'file:///path/to/file.as';

export function makeFileContentList(fileContents: FileContents): FileContentUnit[] {
    if (isRawContent(fileContents)) {
        return [{
            uri: defaultTargetUri,
            content: fileContents
        }];
    } else {
        return structuredClone(fileContents);
    }
}

export function inspectFileContents(fileContentList: FileContentUnit[]): Inspector {
    const inspector = new Inspector();

    for (const content of fileContentList) {
        inspector.inspectFile(content.uri, content.content);
    }

    inspector.flushRecord();

    return inspector;
}

