type Cell=string|number;
export type ReportTable={title:string;head:Cell[];rows:Cell[][]};
export type ExportFormat='pdf'|'xlsx'|'csv';
const csvCell=(cell:Cell)=>{
  const value=typeof cell==='string'&&/^[\s]*[=+\-@\t\r]/u.test(cell)?"'"+cell:String(cell);
  return '"'+value.replaceAll('"','""')+'"';
};

export async function exportReports(format:ExportFormat,period:string,tables:ReportTable[]){
  const name='relatorio-'+period.replace(/[^0-9-]+/g,'-');
  if(format==='pdf'){
    const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
    const doc=new jsPDF({orientation:'landscape'});
    tables.forEach((table,index)=>{
      if(index)doc.addPage();
      doc.setFontSize(15);doc.text(table.title,14,14);
      doc.setFontSize(10);doc.text(period,14,21);
      autoTable(doc,{startY:26,head:[table.head],body:table.rows,headStyles:{fillColor:[49,81,54]}});
    });
    doc.save(name+'.pdf');
    return;
  }
  if(format==='xlsx'){
    const xlsx=await import('xlsx');
    const book=xlsx.utils.book_new();
    for(const table of tables)xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([[period],table.head,...table.rows]),table.title.slice(0,31));
    xlsx.writeFile(book,name+'.xlsx');
    return;
  }
  const rows=tables.flatMap(table=>[[table.title],table.head,...table.rows,[]]);
  const csv='\uFEFF'+[[period],[],...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name+'.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
