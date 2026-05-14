export const createQueryStringMock = () => {
    return {
        parse: (str) => {
            const obj = {};
            if (str.startsWith('?'))
                str = str.slice(1);
            str.split('&').forEach(part => {
                const [k, v] = part.split('=');
                if (k)
                    obj[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
            });
            return obj;
        },
        stringify: (obj) => {
            return Object.entries(obj)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
                .join('&');
        }
    };
};
//# sourceMappingURL=querystring.js.map