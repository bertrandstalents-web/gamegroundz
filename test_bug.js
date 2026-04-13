const assert = require('assert');
let joined = "2";
let reqTotalQty = 4;
let capacity = 21;
if (joined + reqTotalQty > capacity) {
    console.log(`Failed! joined + reqTotalQty > capacity. Left: ${capacity - joined}`);
}
