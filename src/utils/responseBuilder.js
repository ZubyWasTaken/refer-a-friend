function appendNumberedLinks(
    prefix,
    links,
    { maxLength = 2000 } = {}
) {
    let response = prefix;
    let shown = 0;

    for (let index = 0; index < links.length; index++) {
        const line = `${index + 1}. ${links[index]}\n`;
        const omittedAfterThis = links.length - index - 1;
        const reserve = omittedAfterThis > 0
            ? `…and ${omittedAfterThis} more invite${omittedAfterThis === 1 ? '' : 's'} not shown.`
            : '';

        if (response.length + line.length + reserve.length > maxLength) {
            break;
        }

        response += line;
        shown++;
    }

    const omitted = links.length - shown;
    if (omitted > 0) {
        response += `…and ${omitted} more invite${omitted === 1 ? '' : 's'} not shown.`;
    }

    return response.slice(0, maxLength);
}

module.exports = { appendNumberedLinks };
