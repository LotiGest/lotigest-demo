import {readFileSync,writeFileSync} from 'node:fs';
const dir='validation-results';
const manifest=readFileSync(dir+'/manifest.txt','utf8').trim().split('\n').filter(Boolean);
const totals={files:manifest.length,tests:0,pass:0,fail:0,cancelled:0,skipped:0,todo:0};
const failures=[];
for(const file of manifest){
 const name=dir+'/'+file.replaceAll('/','__')+'.tap';
 try{
  const status=Number(readFileSync(name+'.status','utf8').split('\t')[0]);
  const tap=readFileSync(name,'utf8');
  const counts={};
  for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
   const m=[...tap.matchAll(new RegExp('^# '+key+' (\\d+)\\s*$','gm'))].at(-1);
   if(!m)throw Error('missing TAP total: '+key+'; exit='+status);
   counts[key]=Number(m[1]);totals[key]+=counts[key];
  }
  if(status!==0||counts.tests===0||counts.pass!==counts.tests||counts.fail||counts.cancelled||counts.skipped||counts.todo)failures.push({file,status,...counts});
 }catch(error){failures.push({file,error:error.message});}
}
const report={totals,failures};
writeFileSync(dir+'/summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!manifest.length||failures.length)process.exitCode=1;
