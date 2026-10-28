/** Legacy compatibility only. Firestore is not used for persistence. */
export async function syncCoursesFromFirestore(){ return null; }
export async function syncCoursesToFirestore(_courses:any[]){ return; }
export async function syncAccountsFromFirestore(){ return null; }
export async function syncAccountsToFirestore(_teachers:any[],_students:any[]){ return; }
export async function syncPendingRegistrationsFromFirestore(){ return null; }
export async function syncPendingRegistrationsToFirestore(_regs:any[]){ return; }
export async function syncDocFromFirestore(_docName:string){ return null; }
export async function syncDocToFirestore(_docName:string,_payload:any){ return; }
export async function syncActiveSessionToFirestore(_idUser:string,_sessionId:string){ return; }
export async function checkActiveSessionInFirestore(_idUser:string,_sessionId:string){ return true; }
