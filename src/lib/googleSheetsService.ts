/** Google Sheets is permanently disabled in SUPABASE-ONLY mode. */
export interface GoogleSheetsConfig { spreadsheetId?: string; spreadsheetUrl?: string; autoSync?: boolean; syncMode?: string; appsScriptUrl?: string; lastSyncTime?: string; clientId?: string; [key:string]: any; }
export const GOOGLE_APPS_SCRIPT_TEMPLATE = '';
export const DEFAULT_APPS_SCRIPT_URL = '';
export function getStoredGoogleSheetsConfig(): GoogleSheetsConfig { return { autoSync:false, syncMode:'disabled' }; }
export function saveStoredGoogleSheetsConfig(_config: GoogleSheetsConfig): void {}
export function getStoredOAuthToken(): any { return null; }
export function saveStoredOAuthToken(_token:string,_expiresInSec?:number):void {}
export function clearStoredOAuthToken():void {}
export async function requestGoogleAccessToken(_interactive=false): Promise<any> { return null; }
export async function syncWithAppsScript(_url:string,_action:string,_payload?:any): Promise<any> { return { success:false, disabled:true, message:'Google Sheets đã bị vô hiệu hóa.', spreadsheetId:'', spreadsheetUrl:'', title:'', data:null }; }
export async function checkGoogleSheetsConnectionStatus(){ return { connected:false,status:'disabled',message:'Google Sheets đã bị vô hiệu hóa.' }; }
export async function pushToGoogleSheets(..._args:any[]){ return {success:false,disabled:true}; }
export async function pullFromGoogleSheets(..._args:any[]){ return {success:false,disabled:true,data:null}; }
