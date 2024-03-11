let s_isDebug: boolean = true;

export function setDebug(debug: boolean) {
    s_isDebug = debug;
}

export function runningDebug() {
    return s_isDebug;
}

export function runningRelease() {
    return s_isDebug === false;
}
