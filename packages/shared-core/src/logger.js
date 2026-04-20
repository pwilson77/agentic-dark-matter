export function printEvent(event) {
    const prefix = event.status === "ok"
        ? "[ok]"
        : event.status === "warn"
            ? "[warn]"
            : "[info]";
    const meta = event.meta ? ` ${JSON.stringify(event.meta)}` : "";
    console.log(`${prefix} ${event.step}: ${event.detail}${meta}`);
}
