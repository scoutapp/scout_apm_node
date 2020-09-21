"use strict";
const express = require('express');
const scout = require('@scout_apm/scout-apm');
const server = express();
server.use(scout.expressMiddleware());
server.get('/leak', (req, res) => {
    res.status(200).send('sending requests to this endpoint causes memory leak');
});
return scout.install({
    allowShutdown: true,
    monitor: true,
    name: 'example-app',
    key: 'examplekey',
})
    .then(() => {
    console.log('installed scout apm');
    server.listen(3000, () => console.log('server started on port 3000'));
});
