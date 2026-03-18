interface EditorState {
    workspaceFolderUris: string[];
}

const s_editorState: EditorState = {
    workspaceFolderUris: []
};

export function getEditorState(): EditorState {
    return s_editorState;
}
