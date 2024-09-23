/* ----- FACEBOOK API (2024-09-23 05:05) ----- */
function facebook(browser) {

    // MESSAGES: [role="main"] [role="grid"]>div>div>div>div[class]

    this.page = null;
    this.client = null;
    this.status = 0; // No Page, At login page, At /messages
    this.start = async () => {
        this.page = await browser.newPage();
        this.page.setDefaultTimeout(60000); // 1 minute Timeout

        // Websocket interception
        if (true) {
            this.client = await this.page.target().createCDPSession();
            await this.client.send('Network.enable');

            // Listen for WebSocket messages
            this.client.on('Network.webSocketFrameReceived', (event) => {
                try {
                    let data = atob(event.response.payloadData);
                    if (data.indexOf('/ls_resp') == 5) {
                        let obj = JSON.parse(data.slice(15));
                        obj.payload = JSON.parse(obj.payload);
                        let rec = obj.payload.step[1][2][2][1][2][2].filter(x=>x.length>1).map(x=>x[1]);
                        let ans = {};
                        for (const info of rec) {
                            if (info[1] == 'updateThreadSnippet') {
                                if (info[5][1] != info[2][1]) return; // Self message
                                ans.text = info[3];
                                ans.user = Number(info[5][1]);
                            } else if (info[1] == 'insertBlobAttachment') {
                                if (!('file' in ans)) ans.file = [];
                                delete ans.text;
                                ans.file.push(info[5]);
                            }
                        }
                        this.recieve(ans);
                    }
                } catch (e) {
                }
            });
        }

        // Load messages
        await this.page.goto('https://www.facebook.com/messages');
        const profile = await this.page.$('[aria-label="Your profile"]');
        //const title = await this.page.title();
        //this.status = ['Log in to Facebook','Facebook – log in or sign up','Log into Facebook'].includes(title) ? 1 : 2;
        this.status = profile ? 2 : 1;
    };
    this.close = () => {
        if (this.status != 0) this.page.close();
    };
    this.error = [];
    this.logout = async () => {
        // Error Capturing
        if (this.status == 0) this.error.append('Setup webpage first! "this.start()"');
        else if (this.status == 1) this.error.append('User is not logged in!');
        if (this.status != 2) return false;

        await this.page.click('[aria-label="Your profile"]');
        await this.page.waitForSelector('[role="list"] div[data-visualcompletion="ignore-dynamic"]:last-child');
        await this.page.click('[role="list"] div[data-visualcompletion="ignore-dynamic"]:last-child');
        await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
        this.status = 1;
        return true;
    };
    this.login = async (user, pass, name) => {
        // Error Capturing
        if (this.status == 0) this.error.append('Setup webpage first! "this.start()"');
        else if (this.status == 2) this.error.append('User is already logged in!');
        if (this.status != 1) return false;

        // Previous confirmation reset like "Not Me" and "Login through password"
        await this.page.waitForSelector('[method=post] .clearfix ._aklt, #not_me_link,#email');
        const aklt = await this.page.$('[method=post] .clearfix ._aklt');
        const not_me = await this.page.$('#not_me_link');
        if (aklt || not_me) await Promise.all([
            this.page.click(aklt ? '[method=post] .clearfix ._aklt' : '#not_me_link'),
            this.page.waitForNavigation({ waitUntil: 'networkidle0' })
        ]);

        // Entering username and password
        await this.page.evaluate((user, pass) => {
            document.getElementById('email').value = user;
            document.getElementById('pass').value = pass;
            document.querySelector('[type=submit]').click();
        }, user, pass);

        // Getting result
        await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
        await this.page.waitForSelector('[method=post] .clearfix ._aklt, #not_me_link, #email._9ay4, [aria-label="Your profile"]');
        const profile = await this.page.$('[aria-label="Your profile"]');
        const not_me2 = await this.page.$('#not_me_link');
        if (profile) {
            this.status = 2;
            if (name) {
                await this.page.click('[aria-label="Your profile"]');
                //await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
                await this.page.waitForSelector('[aria-label="Your profile"][role="dialog"]');
                const nprof = await this.page.$(`[aria-label="Switch to ${name}"]`);
                if (nprof) {
                    await this.page.click(`[aria-label="Switch to ${name}"]`);
                    await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
                    await this.page.goto('https://www.facebook.com/messages');
                } else return false;
            }
            //await this.page.goto('https://www.facebook.com/messages');
            //await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
            return true;
        }
        if (not_me2) await this.page.click('#not_me_link');
        return false;
    };
    this.send = async (chat, data={}) => {
        // Error Capturing
        if (this.status == 0) this.error.append('Setup webpage first! "this.start()"');
        else if (this.status == 1) this.error.append('Login first!');
        if (this.status != 2) return false;

        // Open chat area
        if (this.page.url().split('/').length < 6 || chat != this.page.url().split('/')[5]) {
            await this.page.goto(`https://www.facebook.com/messages/t/${chat}`);
            await this.page.waitForSelector('[aria-label="Send a like"]');
        }

        // Send a like
        if (Object.keys(data).length == 0) {
            this.page.click('[aria-label="Send a like"]');
            return true;
        }

        // Send a sticker
        if ('sticker' in data) {
            await this.page.click('[aria-label="Choose a sticker"]');
            await this.page.waitForSelector('[aria-label="Search stickers"]');
            await this.page.click('[aria-label="Search stickers"]');
            await this.page.evaluate(async sticker => {
                await navigator.clipboard.writeText(sticker);
            }, data.sticker);
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyV');
            await this.page.keyboard.up('Control');
            await this.page.waitForSelector('#js_s table td [aria-label]');
            await this.page.click('#js_s table td [aria-label]');
        }

        // Send files
        if ('file' in data) {
            let raw = data.file.filter(p => typeof p == 'string');
            if (raw.length) {
                await this.page.waitForSelector('input[type="file"]');
                const input = await this.page.$('input[type="file"]');
                await input.uploadFile(...data.file);
                await this.page.evaluate(() => {
                    const input = document.querySelector('input[type="file"]');
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
            let obj = data.file.filter(p => typeof p == 'object');
            for (const o of obj) {
                await this.page.click('[aria-label="Message"]');
                if (o.type == 'canvas') {
                    let b64 = '';
                    /*if (typeof img == 'string') {
                        const res = await fetch(img);
                        if (!res.ok) continue;
                        const buffer = Buffer.from(await res.arrayBuffer());
                        b64 = `data:${res.headers.get('content-type')};base64,${buffer.toString('base64')}`;
                    }*/

                    await this.page.evaluate(async (render_str, pass) => new Promise(async (res,rej) => {
                        let render = eval(`(${render_str})`);
                        let c = document.createElement('canvas');
                        let x = c.getContext('2d');
                        let t = 'image/png';
                        if (typeof render == 'function') {
                            await render(c, x, JSON.parse(pass));
                        } else {
                            let i = await new Promise((res,rej) => {
                                let i = new Image();
                                i.src = render;
                                i.onload = () => res(i);
                                i.onerror = e => {
                                    throw e;
                                };
                            });
                            c.setAttribute('width', i.width);
                            c.setAttribute('height', i.height);
                            x.drawImage(i, 0, 0);
                        }
                        c.toBlob(async blob => {
                            const item = new ClipboardItem({ 'image/png': blob });
                            navigator.clipboard.write([item]).then(res).catch(rej);
                        }, 'image/png');
                    }), o.render.toString(), JSON.stringify(o.pass));/*typeof img == 'function' ? img.toString() : `"${b64.replaceAll('\\','\\\\').replaceAll('"','\\"')}"`);*/
                    await this.page.keyboard.down('Control');
                    await this.page.keyboard.press('KeyV');
                    await this.page.keyboard.up('Control');
                }

            }
        }

        // Paste a text
        if ('text' in data) {
            await this.page.click('[aria-label="Message"]');
            await this.page.evaluate(async text => {
                await navigator.clipboard.writeText(text);
            }, data.text);
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyV');
            await this.page.keyboard.up('Control');
        }

        // Paste an image
        /*
        if ('img' in data) for (const img of data.img) {
            await this.page.click('[aria-label="Message"]');
            let b64 = '';
            if (typeof img == 'string') {
                const res = await fetch(img);
                if (!res.ok) continue;
                const buffer = Buffer.from(await res.arrayBuffer());
                b64 = `data:${res.headers.get('content-type')};base64,${buffer.toString('base64')}`;
            }

            await this.page.evaluate(async render_str => new Promise(async (res,rej) => {
                let render = eval(`(${render_str})`);
                let c = document.createElement('canvas');
                let x = c.getContext('2d');
                let t = 'image/png';
                if (typeof render == 'function') {
                    await render(c, x);
                } else {
                    let i = await new Promise((res,rej) => {
                        let i = new Image();
                        i.src = render;
                        i.onload = () => res(i);
                        i.onerror = e => {
                            throw e;
                        };
                    });
                    c.setAttribute('width', i.width);
                    c.setAttribute('height', i.height);
                    x.drawImage(i, 0, 0);
                }
                c.toBlob(async blob => {
                    const item = new ClipboardItem({ 'image/png': blob });
                    navigator.clipboard.write([item]).then(res).catch(rej);
                }, 'image/png');
            }), typeof img == 'function' ? img.toString() : `"${b64.replaceAll('\\','\\\\').replaceAll('"','\\"')}"`);
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyV');
            await this.page.keyboard.up('Control');
        }*/

        // Send paste things
        await this.page.waitForSelector('[aria-label="Press enter to send"]');
        await this.page.click('[aria-label="Press enter to send"]');

        // Wait for message to be sent
        await this.page.waitForFunction(() => {
            return document.querySelector('[role="main"] [role="grid"]>div>div:last-child>div>div[class] [data-scope="messages_table"]>*:last-child').innerText == 'Sent';
        });

        return true;
    };
    this.recieve = data => {};
}
if (typeof module !== 'undefined' && module.exports) module.exports = facebook;
