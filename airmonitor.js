/* ----- MODULES TO IMPORT ----- */
const express = require('express');
const http = require('http');
const socket = require('socket.io');
const puppeteer = require('puppeteer-core');
const fb_api = require('./facebook.js');

/* ----- SERVERS ----- */
const app = express();
const server = http.createServer(app);
const io = new socket.Server(server);

/* ----- CONFIGURATION ----- */
const chrome = '/usr/bin/chromium';
let data = [];
const sleep = 1000;

/* ---- PUPPETEER ----- */
var web, fb;

async function setup() {
    web = await puppeteer.launch({
        executablePath: chrome,
        userDataDir: './userdat',
        args: [ '--disable-infobars', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu' ],
        headless: true,
    });
    fb = new fb_api(web);
    fb.start();
    //io.emit('status', fb.status);
    fb.recieve = async req => {
        if ('text' in req && req.text.toLowerCase() == 'graph') await fb.send(req.user, {file: [{
            type: 'canvas',
            pass: data,
            render: (can, x, data) => {
                data = data.map(x=>[x[0],new Date(x[1])]);
                console.log(data);
                let w = 1280, h = 720;
                let pad = 40; // Padding
                let ypad = pad*2; // Line padding vertically
                let xmin = pad*0.25; // Minimum Horizontal Graph Line
                let adat = [];
                let m = Math.max(100, ...data.map(x=>x[0]));
                can.setAttribute('width', w+2*pad);
                can.setAttribute('height', h+2*pad);
                x.fillStyle = '#22262e';
                x.fillRect(0, 0, w+2*pad, h+2*pad);

                // Graph Background
                x.strokeStyle = 'rgb(45,49,57)';
                x.lineWidth = 5;
                x.font = '18px Tahoma';
                x.textAlign = 'end';
                x.textBaseline = "middle";
                x.lineCap = "round";
                x.fillStyle = 'hsl(220 12% 40% / 1)';
                var z = Math.ceil(h/ypad);
                for(var i = 0; i <= z; i+=2) {
                    x.fillText(Math.round(i*m/z), pad*0.8, h+pad-h*i/z);
                    x.beginPath();
                    x.moveTo(pad, h+pad-h*i/z);
                    x.lineTo(w+pad, h+pad-h*i/z);
                    x.stroke();
                }
                let min = new Date(new Date()-1);
                let dif = 1;
                if (data.length == 0) adat = [[0,min],[0,new Date()]];
                else if (data.length == 1) {
                    min = new Date(data[0][1]-1);
                    adat = [[data[0][0],min],data[0]];
                } else {
                    min = data[0][1];
                    dif = data[data.length-1][1]-min;
                    let u = Math.ceil(xmin*data.length/w);
                    adat = [];
                    for(var i = 0; i < data.length; i += u) {
                        var A = data[i];
                        let n = 1;
                        for (var j = 1; j < u && i+j < data.length; j++) {
                            A[0] += data[i+j][0];
                            n++;
                        }
                        A[0] /= n;
                        adat.push(A);
                    }
                }
                // Graph
                x.strokeStyle = 'rgb(20,104,97)';
                x.beginPath();
                for (const a of adat) x[i ? 'lineTo' : 'moveTo'](pad+w*(a[1]-min)/dif, h+pad-a[0]/m*h);
                x.stroke();
                // Date
                x.textAlign = 'start';
                x.fillText(adat[0][1].getHours().toString().padStart(2,'0')+':'+adat[0][1].getMinutes().toString().padStart(2,'0'), pad, h+pad*1.5);
                x.textAlign = 'end';
                x.fillText(adat[adat.length-1][1].getHours().toString().padStart(2,'0')+':'+adat[adat.length-1][1].getMinutes().toString().padStart(2,'0'), w+pad, h+pad*1.5);
            }
        }]});
        else if ('text' in req && req.text.toLowerCase() == 'quit') {
            await fb.send(req.user, {text:'Good bye!'});
            exit();
        } else {
            let tdif = d => d < 1000 ? `${d} miliseconds` : d < 60000 ? `${Math.floor(d/1000)} seconds` : d < 3600000 ? `${Math.floor(d/60000)} minutes` :  `${Math.floor(d/3600000)} hours`;
            await fb.send(req.user, {text: data.length ? `Current measurement: ${Math.round(data[data.length-1][0],2)}\n(${tdif((new Date())-data[data.length-1][1])} ago)` : 'No data yet, connect to air sensor',});
        }
    }

    /* ----- SOCKET ----- */
    io.on('connection', sock => {
        sock.emit('data', data);
        sock.emit('status', fb.status);
        sock.on('login', async form => {
            sock.emit('login', 0);
            let ok = await fb.login(form.user, form.pass, 'API');
            sock.emit('login', ok ? 1 : -1);
            sock.emit('status', fb.status);
        });
    });

    /* ----- SERVER ----- */
    app.get('/data', (req, res) => {
        let ns = Object.keys(req.query).filter(x=>Number(x)!=NaN);
        let n = ns.length ? Number(ns[0]) : Math.random()*100;
        let d = [n, new Date()];
        io.emit('data', [d]);
        data.push(d);
        res.send('done');
    });
    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>AirQuality</title>
                <style>
                    :focus { outline: none; }
                    html, body { height: 100%; }
                    body { display: grid; grid-template: 50px auto 50px / auto 50px; background-color: rgb(45,49,57); font-family: Tahoma; margin: 0; padding: 10px; box-sizing: border-box; }
                    h1 { grid-area: 1 / 1; color: #fff; margin: 0 10px; line-height: 40px; }
                    svg { padding: 5px; height: 30px; fill: #fff; float: left; margin-right: 10px; }
                    button { grid-area: 1 / 2; background: none; color: #fff; border: 0; }
                    button svg { display: none; }
                    canvas { grid-area: 2 / 1 / span 1 / span 2; background-color: rgb(34,38,46); border-radius: 30px; width: 100%; height: 100%; max-width: calc(100vw - 10px); max-height: calc(100vh - 116px); }
                    p { grid-area: 3 / 1 / span 1 / span 2; color: rgb(98,99,103); text-align: center; }
                    form { grid-area: 2 / 1 / span 1 / span 2; background-color: rgb(34,38,46); border-radius: 30px; display: none; flex-direction: column; justify-content: center; padding: 50px; gap: 50px; }
                    input { height: 30px; padding: 10px; line-height: 30px; font-size: 20px; background-color: #626367; border-radius: 10px; border: 0; color: #fff; }
                    input::placeholder { color: #22262e; }
                    input[type=submit] { height: 50px; color: #ddd; font-weight: bold; background-color: rgb(20,104,97); }
                    h2 { color: #fff; text-align: center; }
                    .flex { display: flex; }
                    .block { display: block; }
                </style>
                <script src="/socket.io/socket.io.js"></script>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0, minimum-scale=1.0">
            </head>
            <body>
                <h1>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M288 32c0 17.7 14.3 32 32 32l32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128c-17.7 0-32 14.3-32 32s14.3 32 32 32l320 0c53 0 96-43 96-96s-43-96-96-96L320 0c-17.7 0-32 14.3-32 32zm64 352c0 17.7 14.3 32 32 32l32 0c53 0 96-43 96-96s-43-96-96-96L32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0c-17.7 0-32 14.3-32 32zM128 512l32 0c53 0 96-43 96-96s-43-96-96-96L32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0c-17.7 0-32 14.3-32 32s14.3 32 32 32z"/></svg>
                    AirQuality
                </h1>
                <button>
                    <svg class="block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z"/></svg>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M575.8 255.5c0 18-15 32.1-32 32.1l-32 0 .7 160.2c0 2.7-.2 5.4-.5 8.1l0 16.2c0 22.1-17.9 40-40 40l-16 0c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1L416 512l-24 0c-22.1 0-40-17.9-40-40l0-24 0-64c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32 14.3-32 32l0 64 0 24c0 22.1-17.9 40-40 40l-24 0-31.9 0c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2l-16 0c-22.1 0-40-17.9-40-40l0-112c0-.9 0-1.9 .1-2.8l0-69.7-32 0c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z"/></svg>
                </button>
                <canvas id="graph"></canvas>
                <p>Not connected</p>
                <form action="javascript:;" onsubmit="return login(this)">
                    <h2>Login in Messenger</h2>
                    <input name="user" placeholder="Username:"></input>
                    <input name="pass" placeholder="Password:" type="password"></input>
                    <input type="submit" value="Login"></input>
                </form>
                <script>
                    var socket = io();
                    var $ = x => document.querySelector(x);
                    var x = $('#graph').getContext('2d');
                    var data = [];
                    var pad = 40; // Padding
                    var ypad = pad*2; // Line padding vertically
                    var xmin = pad*0.25; // Minimum Horizontal Graph Line
                    var adat = data; // Appered Data

                    socket.on('connect', () => $('p').innerText = 'Connected');
                    socket.on('disconnect', () => $('p').innerText = 'Disconnected');
                    socket.on('data', d => data = data.concat(d.map(x=>[x[0],new Date(x[1])])));
                    socket.on('login', n => {
                        $('h2').innerText = ['Failed to Login','Logging...','Logged in'][n+1];
                        if (n == 1 && $('form').classList.contains('flex')) $('button').click();
                    });
                    socket.on('status', n => {
                        $('h2').innerText = ['Setting up', 'Login into Facebook', 'Logged in'][n];
                    });

                    function draw() {
                        var box = $('#graph').getBoundingClientRect();
                        var h = box.height-2*pad;
                        var w = box.width-2*pad;
                        var m = Math.max(100, ...data.map(x=>x[0]));

                        // Canvas
                        $('#graph').setAttribute('width', box.width);
                        $('#graph').setAttribute('height', box.height);
                        x.clearRect(0, 0, box.width, box.height);

                        // Graph Background
                        x.strokeStyle = 'rgb(45,49,57)';
                        x.lineWidth = 5;
                        x.font = '18px Tahoma';
                        x.textAlign = 'end';
                        x.textBaseline = "middle";
                        x.lineCap = "round";
                        x.fillStyle = 'hsl(220 12% 40% / 1)';
                        var z = Math.ceil(h/ypad);
                        for(var i = 0; i <= z; i+=2) {
                            x.fillText(Math.round(i*m/z), pad*0.8, h+pad-h*i/z);
                            x.beginPath();
                            x.moveTo(pad, h+pad-h*i/z);
                            x.lineTo(w+pad, h+pad-h*i/z);
                            x.stroke();
                        }
                        let min = new Date(new Date()-1);
                        let dif = 1;
                        if (data.length == 0) adat = [[0,min],[0,new Date()]];
                        else if (data.length == 1) {
                            min = new Date(data[0][1]-1);
                            adat = [[data[0][0],min],data[0]];
                        } else {
                            min = data[0][1];
                            dif = data[data.length-1][1]-min;
                            let u = Math.ceil(xmin*data.length/w);
                            adat = [];
                            for(var i = 0; i < data.length; i += u) {
                                var A = data[i];
                                let n = 1;
                                for (var j = 1; j < u && i+j < data.length; j++) {
                                    A[0] += data[i+j][0];
                                    n++;
                                }
                                A[0] /= n;
                                adat.push(A);
                            }
                        }
                        // Graph
                        x.strokeStyle = 'rgb(20,104,97)';
                        x.beginPath();
                        for (const a of adat) x[i ? 'lineTo' : 'moveTo'](pad+w*(a[1]-min)/dif, h+pad-a[0]/m*h);
                        x.stroke();
                        // Date
                        x.textAlign = 'start';
                        x.fillText(adat[0][1].getHours().toString().padStart(2,'0')+':'+adat[0][1].getMinutes().toString().padStart(2,'0'), pad, h+pad*1.5);
                        x.textAlign = 'end';
                        x.fillText(adat[adat.length-1][1].getHours().toString().padStart(2,'0')+':'+adat[adat.length-1][1].getMinutes().toString().padStart(2,'0'), w+pad, h+pad*1.5);
                    }
                    setInterval(draw, 1000/30);

                    $('button').onclick = () => {
                        $('form').classList.toggle('flex');
                        $('button svg:first-child').classList.toggle('block');
                        $('button svg:last-child').classList.toggle('block');
                    };

                    function login(form) {
                        $('h2').innerText = 'Loading...';
                        socket.emit('login', {
                            user: $('[name=user]').value,
                            pass: $('[name=pass]').value,
                        });
                        return false;
                    }
                </script>
            </body>
            </html>
        `);
    });
    server.listen(80, () => console.log('Hosting'));
}
setup();
