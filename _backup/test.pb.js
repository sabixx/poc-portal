console.log("TEST HOOK LOADED!");

routerAdd("GET", "/api/test", (c) => {
    return c.json(200, { message: "Hook works!" });
});
