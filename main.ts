const TARGET_HOST = Deno.env.get("TARGET_HOST");

Deno.serve(async (request: Request) => {
    const url = new URL(request.url);
    url.host = TARGET_HOST;

    const newRequest = new Request(url.toString(), {
        headers: request.headers,
        method: request.method,
        body: request.body,
        redirect: "follow",
    });
    return await fetch(newRequest);
});