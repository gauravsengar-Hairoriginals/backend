const fs = require('fs');
const { parse } = require('csv-parse/sync');

function decodeFileBuffer(buffer) {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return buffer.toString('utf16le');
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        const swapped = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length - 1; i += 2) {
            swapped[i] = buffer[i + 1];
            swapped[i + 1] = buffer[i];
        }
        return swapped.toString('utf16le');
    }
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return buffer.toString('utf-8', 3);
    }
    return buffer.toString('utf-8');
}

try {
    const fileBuffer = fs.readFileSync("/Users/gauravsengar/Downloads/Men patch_Leads_2026-01-29_2026-01-29 (1).csv");
    const csvText = decodeFileBuffer(fileBuffer);

    // Facebook CSVs might still use \t instead of commas sometimes depending on the export, but the standard says ,
    // Let's print the first 200 chars to see what it looks like before parsing
    console.log("--- RAW UTF8 TEXT START ---");
    console.log(csvText.substring(0, 200));
    console.log("--- RAW UTF8 TEXT END ---\n");

    // Facebook also exported with tabs not commas in some weird cases, let's look at the first line
    const firstLine = csvText.split('\n')[0];
    const hasTabs = firstLine.includes('\t');
    console.log(`Delimiter detected: ${hasTabs ? 'TAB' : 'COMMA'}`);

    const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        delimiter: hasTabs ? '\t' : ',' // Dynamic delimiter based on Facebook export
    });

    console.log(`Successfully parsed ${records.length} records!`);
    console.log("First record keys:", Object.keys(records[0]));

} catch (err) {
    console.error("Parse Error:", err);
}
