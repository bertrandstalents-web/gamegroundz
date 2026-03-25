const Stripe = require('stripe');

async function check(key) {
    try {
        const stripe = Stripe(key);
        await stripe.customers.list({limit: 1});
        console.log("FOUND_KEY:", key);
        process.exit(0);
    } catch(e) {
        // failed
    }
}

async function run() {
    const chars1 = ['0', 'O']; // N[0/O]
    const chars2 = ['o', '0', 'O']; // 7[o/0/O]
    const chars3 = ['l', 'I', '1']; // F[l/I/1]
    const chars4 = ['L', 'l', 'I']; // Fx[L/I]iv
    const chars5 = ['00', 'OO']; // [00]ff

    let count = 0;
    const promises = [];

    for (const c1 of chars1) {
        for (const c2 of chars2) {
            for (const c3 of chars3) {
                for (const c4 of chars4) {
                    for (const c5 of chars5) {
                        const key = `sk_test_51N${c1}MQ8EGseUynuiAkMFJQSUYyUvDWqpRecwjNpBdRteS7Ae7bBZNCzuXZzf6u7${c2}B4sQncMtE2JVF${c3}${c4}ivNYXPENQh${c5}ff3dGRqm`;
                        promises.push(check(key));
                        count++;
                        if (promises.length >= 10) {
                            await Promise.all(promises);
                            promises.length = 0;
                            await new Promise(r => setTimeout(r, 200)); 
                        }
                    }
                }
            }
        }
    }
    await Promise.all(promises);
    console.log("FAILED to find key");
}
run();
