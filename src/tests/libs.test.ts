import { KillioKernel } from '../kernel.js';
import { CacheProvider } from '../vfs/cache.provider.js';

async function runTest() {
  const kernel = new KillioKernel(new CacheProvider('test-user'));
  await kernel.boot();
  kernel.setCWD('/home/agent');
  
  console.log('--- Testing PDFKit ---');
  const pdfScript = `
    import PDFDocument from 'pdfkit';
    import fs from 'fs';
    const doc = new PDFDocument();
    const stream = fs.createWriteStream('test.pdf');
    doc.pipe(stream);
    doc.fontSize(25).text('Hello from Killio OS!', 100, 100);
    doc.end();
    
    // Wait for stream to finish
    await new Promise(resolve => stream.on('finish', resolve));
    console.log('PDF generated successfully');
  `;
  
  const res1 = await kernel.execute(['node', '-e', pdfScript]);
  console.log('Output:', res1.output);
  
  const pdfFile = await kernel.getVFS().getNode('/home/agent/test.pdf');
  console.log('PDF File in VFS:', pdfFile ? 'Found' : 'Not Found', 'Size:', pdfFile?.metadata?.size);

  console.log('\n--- Testing DOCX ---');
  const docxScript = `
    import { Document, Packer, Paragraph, TextRun } from 'docx';
    import fs from 'fs';

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun("Hello from DOCX library in Killio OS!"),
                        new TextRun({
                            text: "\\nThis is a bold text",
                            bold: true,
                        }),
                    ],
                }),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFileSync('test.docx', buffer);
    console.log('DOCX generated successfully');
  `;

  const res2 = await kernel.execute(['node', '-e', docxScript]);
  console.log('Output:', res2.output);
  
  const docxFile = await kernel.getVFS().getNode('/home/agent/test.docx');
  console.log('DOCX File in VFS:', docxFile ? 'Found' : 'Not Found', 'Size:', docxFile?.metadata?.size);

  console.log('\n--- Testing QuickChart ---');
  const chartScript = `
    const QuickChart = require('quickchart-js');
    const fs = require('fs');
    
    const myChart = new QuickChart();
    myChart.setConfig({
      type: 'bar',
      data: { labels: ['A', 'B', 'C'], datasets: [{ label: 'Foo', data: [1, 2, 3] }] },
    });

    const url = myChart.getUrl();
    console.log('Chart URL:', url);
    
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFileSync('chart.png', buffer);
    console.log('Chart image saved to VFS');
  `;

  const res3 = await kernel.execute(['node', '-e', chartScript]);
  console.log('Output:', res3.output);
  
  const chartFile = await kernel.getVFS().getNode('/home/agent/chart.png');
  console.log('Chart File in VFS:', chartFile ? 'Found' : 'Not Found', 'Size:', chartFile?.metadata?.size);
}

runTest().catch(console.error);
