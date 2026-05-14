export const curl = async (args, kernel) => {
    if (args.length === 0 || args[0] === '--help') {
        return { output: 'curl: try \'curl --help\' or \'curl --manual\' for more information', exitCode: 1 };
    }
    let url = args[args.length - 1];
    let method = 'GET';
    let body = undefined;
    let headers = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-X' || args[i] === '--request') {
            method = args[i + 1] || 'GET';
            i++;
        }
        else if (args[i] === '-d' || args[i] === '--data') {
            body = args[i + 1];
            i++;
            if (method === 'GET')
                method = 'POST'; // default curl behavior
        }
        else if (args[i] === '-H' || args[i] === '--header') {
            const h = args[i + 1] || '';
            const [k, ...v] = h.split(':');
            if (k && v)
                headers[k.trim()] = v.join(':').trim();
            i++;
        }
    }
    try {
        const defaultHeaders = {
            'User-Agent': 'KillioOS/1.0 (Agent)',
            'X-Forwarded-For': '10.0.0.5',
            'Via': '1.1 killio-os'
        };
        const finalHeaders = { ...defaultHeaders, ...headers };
        const res = await fetch(url, { method, body, headers: finalHeaders });
        const text = await res.text();
        return { output: text, exitCode: 0 };
    }
    catch (e) {
        return { output: `curl: (6) Could not resolve host: ${url}\nError: ${e.message}`, exitCode: 6 };
    }
};
//# sourceMappingURL=network.js.map