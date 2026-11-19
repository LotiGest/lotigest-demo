// Alineación afín local (aproximación visual, NO un levantamiento catastral).
// Cada par: {plan:[x,y], gps:[lat,lng]}; tres referencias no colineales.
export function planAffineFromAnchors(pairs){
 if(!Array.isArray(pairs)||pairs.length!==3)throw Error('Selecciona tres pares de puntos.');
 for(const p of pairs)if(!Array.isArray(p.plan)||!Array.isArray(p.gps)||p.plan.length!==2||p.gps.length!==2||![...p.plan,...p.gps].every(Number.isFinite)||Math.abs(p.gps[0])>90||Math.abs(p.gps[1])>180)throw Error('Referencia del plano o del GPS inválida.');
 const [p,q,r]=pairs,dx=q.plan[0]-p.plan[0],dy=q.plan[1]-p.plan[1],ex=r.plan[0]-p.plan[0],ey=r.plan[1]-p.plan[1],det=dx*ey-dy*ex;
 if(Math.abs(det)<.001)throw Error('Los tres puntos del croquis deben formar un triángulo.');
 const gdx=q.gps[0]-p.gps[0],gdy=q.gps[1]-p.gps[1],hex=r.gps[0]-p.gps[0],hey=r.gps[1]-p.gps[1];
 if(Math.abs(gdx*hey-gdy*hex)<1e-12)throw Error('Los tres puntos del satélite están demasiado juntos o alineados.');
 return {origin:p.plan,at:p.gps,latX:(gdx*ey-hex*dy)/det,latY:(hex*dx-gdx*ex)/det,lngX:(gdy*ey-hey*dy)/det,lngY:(hey*dx-gdy*ex)/det};
}
export function planPointToGps(t,point){
 if(!t||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw Error('Punto inválido.');
 const dx=point[0]-t.origin[0],dy=point[1]-t.origin[1];
 const coords=[t.at[0]+dx*t.latX+dy*t.latY,t.at[1]+dx*t.lngX+dy*t.lngY];
 if(!coords.every(Number.isFinite)||Math.abs(coords[0])>90||Math.abs(coords[1])>180)throw Error('Ubicación fuera del rango GPS.');
 return coords;
}
export function planAffineFeatures(features,pairs){
 const t=planAffineFromAnchors(pairs);
 const mapped=(features||[]).filter(f=>Array.isArray(f.points)&&f.points.length>=3&&f.points.length<=250)
 .map(f=>({feature:f,geo:f.points.map(p=>planPointToGps(t,p))}));
 const coords=mapped.flatMap(m=>m.geo);
 if(!coords.length)throw Error('El croquis no tiene perímetros.');
 const lat=coords.map(p=>p[0]),lng=coords.map(p=>p[1]);
 if(Math.max(...lat)-Math.min(...lat)>.05||Math.max(...lng)-Math.min(...lng)>.05)throw Error('La escala GPS parece incorrecta. Repite los tres puntos.');
 return mapped;
}
