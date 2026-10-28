/** Google Sheets integration removed. Supabase is the only persistent datastore. */
export async function createLmsGoogleSpreadsheet(..._args:any[]): Promise<any>{ return { spreadsheetId:'', spreadsheetUrl:'' }; }
export async function pushAllDataToGoogleSheets(..._args:any[]){ return {success:false,disabled:true,message:'Google Sheets đã bị vô hiệu hóa.'}; }
export async function pullAllDataFromGoogleSheets(..._args:any[]){ return {success:false,disabled:true,data:null,message:'Google Sheets đã bị vô hiệu hóa.'}; }
