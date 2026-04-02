const parsedNewSlots = ['18:00', '18:30', '19:00', '20:00'];
let formattedSlots = "";
if (parsedNewSlots.length > 0) {
    const sorted = [...parsedNewSlots].sort();
    const blocks = [];
    let currentBlock = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i-1];
        const curr = sorted[i];
        let [ph, pm] = prev.split(':').map(Number);
        pm += 30; if (pm >= 60) { ph += 1; pm -= 60; }
        const prevEnd = `${ph.toString().padStart(2, '0')}:${pm.toString().padStart(2, '0')}`;
        if (prevEnd === curr) {
            currentBlock.push(curr);
        } else {
            blocks.push(currentBlock);
            currentBlock = [curr];
        }
    }
    blocks.push(currentBlock);
    
    formattedSlots = blocks.map(block => {
        const start = block[0];
        const endSlot = block[block.length - 1];
        let [eh, em] = endSlot.split(':').map(Number);
        em += 30; if (em >= 60) { eh += 1; em -= 60; }
        const end = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
        return `${start} - ${end}`;
    }).join(', ');
} else {
    formattedSlots = `${parsedNewSlots.length} slots`;
}
console.log(formattedSlots);
