'use client';
import {useState} from 'react';
export default function PasswordField({name='password',label='Password',placeholder='Enter your password',minLength}:{name?:string;label?:string;placeholder?:string;minLength?:number}){
 const [show,setShow]=useState(false);
 return <label>{label}<div style={{position:'relative',width:'100%'}}>
  <input name={name} required type={show?'text':'password'} minLength={minLength} autoComplete={minLength?'new-password':'current-password'} placeholder={placeholder} style={{width:'100%',paddingRight:52}}/>
  <button type="button" aria-label={show?'Hide password':'Show password'} aria-pressed={show} title={show?'Hide password':'Show password'} style={{position:'absolute',right:9,top:'50%',transform:'translateY(-50%)',display:'grid',placeItems:'center',width:36,height:36,padding:0,border:0,background:'transparent',borderRadius:8,color:'#6c675f',cursor:'pointer'}} onClick={()=>setShow(visible=>!visible)}>
   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{pointerEvents:'none'}}>
    {show?<><path d="m3 3 18 18M10.58 10.58a2 2 0 0 0 2.84 2.84"/><path d="M9.88 5.09A10.95 10.95 0 0 1 12 4.9c6.3 0 10 7.1 10 7.1a17.7 17.7 0 0 1-3.12 3.88M6.53 6.53A18.1 18.1 0 0 0 2 12s3.7 7.1 10 7.1a10.9 10.9 0 0 0 5.47-1.63"/></>:<><path d="M2 12s3.7-7.1 10-7.1S22 12 22 12s-3.7 7.1-10 7.1S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}
   </svg>
  </button>
 </div></label>;
}
