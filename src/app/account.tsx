import {useState} from 'react';
import {router} from 'expo-router';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {useAccount} from '../components/account-provider';
import {enabledSocialProviders} from '../lib/supabase';
import {readCollection} from '../lib/local-data';
import Brand from '../components/brand';
import styles from '../components/collection-styles';
export default function AccountScreen(){
  const account=useAccount();
  const pilot=process.env.EXPO_PUBLIC_INVITE_ONLY==='true';
  const [showPassword,setShowPassword]=useState(false);
  const [forgot,setForgot]=useState(false);
  const [confirmPassword,setConfirmPassword]=useState('');
  const [password,setPassword]=useState('');const [newPassword,setNewPassword]=useState('');
  const [showEmailLink,setShowEmailLink]=useState(!pilot);
  const [email,setEmail]=useState('');const [token,setToken]=useState('');
  const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [showDelete,setShowDelete]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState('');const [signOutFailed,setSignOutFailed]=useState(false);
  async function run(action:()=>Promise<void>,message=''){setBusy(true);setNotice('');try{await action();setNotice(message);}catch(error){setNotice(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}
  const guestCount=(['saved','visits','plans'] as const).reduce((sum,kind)=>sum+readCollection(kind,'guest').length,0);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><Brand/><Text style={styles.title}>{account.recovering?'Set a new password':account.user?'Account':forgot?'Reset your password':'Log in to Elsewhere'}</Text>
    {!account.user&&<Text style={styles.muted}>Save places, rate visits, and access your preferences on any device.</Text>}
    {!account.configured&&<View style={styles.card}><Text style={styles.name}>Sign-in unavailable</Text><Text style={styles.muted}>You can continue browsing and save places on this device.</Text><Pressable style={styles.button} onPress={()=>router.navigate('/')}><Text style={styles.buttonText}>Continue browsing</Text></Pressable></View>}
    {account.configured&&!account.user&&forgot&&<View style={styles.card}><Text style={styles.name}>Forgot your password?</Text><Text style={styles.muted}>Enter your account email and we’ll send you a reset link. Open it in this browser.</Text><TextInput accessibilityLabel="Reset email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" style={{borderWidth:1,borderColor:'#D7D0C4',padding:14,borderRadius:12}}/><Pressable accessibilityRole="button" disabled={busy||!/^\S+@\S+\.\S+$/.test(email.trim())} style={[styles.button,{opacity:busy||!/^\S+@\S+\.\S+$/.test(email.trim())?0.4:1}]} onPress={()=>run(()=>account.resetPassword(email),'If your account is eligible for email delivery, you’ll receive a password-reset link shortly. Check your spam folder too.')}><Text style={styles.buttonText}>{busy?'Sending…':'Send reset link'}</Text></Pressable><Text style={styles.muted}>During the private preview, reset emails are available only to approved email recipients. If no email arrives, contact the person who invited you.</Text><Pressable accessibilityRole="button" onPress={()=>{setForgot(false);setNotice('');}}><Text style={styles.action}>← Back to log in</Text></Pressable></View>}
    {account.configured&&!account.user&&!forgot&&<View style={styles.card}>
      <Text style={styles.name}>{pilot?'Private preview':'Continue to your account'}</Text>
      {pilot&&<Text style={styles.muted}>Sign in with the email and password provided with your invitation. Accounts are created by the Elsewhere team during this preview.</Text>}
      {enabledSocialProviders.map(provider=><Pressable key={provider} disabled={busy} style={styles.button} onPress={()=>run(()=>account.social(provider))}><Text style={styles.buttonText}>Continue with {provider==='google'?'Google':'Apple'}</Text></Pressable>)}
      <Text>Email address</Text><TextInput accessibilityLabel="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" style={{borderWidth:1,borderColor:'#D7D0C4',padding:14,borderRadius:12}}/>
      <Text>Password</Text><TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" style={{borderWidth:1,borderColor:'#D7D0C4',padding:14,borderRadius:12}}/>
      <Pressable accessibilityRole="button" disabled={busy||!email.trim()||!password} style={[styles.button,{opacity:busy||!email.trim()||!password?0.4:1}]} onPress={()=>run(async()=>{await account.signInPassword(email.trim(),password);setPassword('');})}><Text style={styles.buttonText}>{busy?'Please wait…':'Log in'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>{setForgot(true);setPassword('');setNotice('');}}><Text style={styles.action}>Forgot password?</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>setShowEmailLink(!showEmailLink)}><Text style={styles.action}>{showEmailLink?'Hide email link option':'Use a sign-in link instead'}</Text></Pressable>
      {showEmailLink&&<>
      {pilot&&<Text style={styles.muted}>Email links are currently available only to approved email recipients. Use your invitation password to test the app.</Text>}
      <Pressable accessibilityRole="button" disabled={busy||!/^\S+@\S+\.\S+$/.test(email.trim())} style={[styles.button,{opacity:busy||!/^\S+@\S+\.\S+$/.test(email.trim())?0.4:1}]} onPress={()=>run(async()=>{await account.sendLink(email.trim());setSent(true);},'Check your email for a sign-in link or code. Open the link on this device.')}><Text style={styles.buttonText}>{busy?'Please wait…':sent?'Send another sign-in email':'Continue with email'}</Text></Pressable>
      {sent&&<><Text>Enter your email code</Text><TextInput accessibilityLabel="Email sign-in code" value={token} onChangeText={setToken} autoCapitalize="none" keyboardType="number-pad" autoComplete="one-time-code" maxLength={12} style={{borderWidth:1,borderColor:'#D7D0C4',padding:14,borderRadius:12}}/><Pressable accessibilityRole="button" disabled={busy||token.trim().length<6} onPress={()=>run(()=>account.verifyCode(email.trim(),token.trim()))}><Text style={styles.action}>Verify code</Text></Pressable></>}
      </>}
      <Text style={styles.muted}>Your ratings and saved places are private.</Text>
    </View>}
    {account.user&&<>
      <View style={styles.card}><Text style={styles.name}>{account.user.email??'Signed in'}</Text><Text style={styles.muted}>{account.status}</Text>{account.error.length>0&&<Text accessibilityRole="alert">{account.error}</Text>}<Pressable disabled={busy} onPress={()=>run(account.sync)}><Text style={styles.action}>Refresh account</Text></Pressable></View>
      {guestCount>0&&<View style={styles.card}><Text style={styles.name}>Import saved data</Text><Text style={styles.muted}>{guestCount} items are saved on this device. Import them into your account without replacing existing account data.</Text><Pressable disabled={busy} onPress={()=>run(account.importGuest,'Data imported.')} style={styles.button}><Text style={styles.buttonText}>Import data</Text></Pressable></View>}
      <Pressable accessibilityRole="button" accessibilityState={{expanded:showPassword||account.recovering}} onPress={()=>{setShowPassword(!showPassword);setNewPassword('');setConfirmPassword('');}}><Text style={styles.action}>{showPassword?'Cancel password change':'Change password'}</Text></Pressable>
      {(showPassword||account.recovering)&&<View style={styles.card}><Text style={styles.name}>{account.recovering?'Choose a new password':'Change password'}</Text><Text style={styles.muted}>Use at least 12 characters for your new password.</Text><TextInput accessibilityLabel="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" style={{borderWidth:1,borderColor:'#D7D0C4',padding:12,borderRadius:12}}/><TextInput accessibilityLabel="Confirm new password" placeholder="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" style={{borderWidth:1,borderColor:'#D7D0C4',padding:12,borderRadius:12}}/>{confirmPassword.length>0&&confirmPassword!==newPassword&&<Text style={styles.muted}>Passwords do not match.</Text>}<Pressable accessibilityRole="button" disabled={busy||newPassword.length<12||confirmPassword!==newPassword} onPress={()=>run(async()=>{if(confirmPassword!==newPassword)throw Error('Passwords do not match.');await account.updatePassword(newPassword);setNewPassword('');setConfirmPassword('');setShowPassword(false);},'Password updated.')}><Text style={styles.action}>Update password</Text></Pressable></View>}
      <Pressable disabled={busy} onPress={()=>run(async()=>{try{await account.signOut();setSignOutFailed(false);}catch(error){setSignOutFailed(true);throw error;}})}><Text style={styles.action}>Sign out</Text></Pressable>
      {signOutFailed&&<Pressable disabled={busy} onPress={()=>run(()=>account.signOut(true))}><Text style={{color:'#A84B30'}}>Sign out and discard unsynced changes on this device</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityState={{expanded:showDelete}} onPress={()=>setShowDelete(!showDelete)}><Text style={[styles.action,{color:'#A84B30'}]}>Delete account</Text></Pressable>
      {showDelete&&<View style={styles.card}><Text style={styles.name}>Delete account</Text><Text style={styles.muted}>Permanently delete your account and its saved data. This cannot be undone. Guest data is not affected. Type DELETE to confirm.</Text><TextInput accessibilityLabel="Confirm account deletion" value={confirmDelete} onChangeText={setConfirmDelete} autoCapitalize="characters" style={{borderWidth:1,borderColor:'#D7D0C4',padding:12,borderRadius:12}}/><Pressable disabled={busy||confirmDelete!=='DELETE'} onPress={()=>run(account.deleteAccount,'Account has been deleted.')}><Text style={{color:'#A84B30',opacity:confirmDelete==='DELETE'?1:0.4}}>Delete account</Text></Pressable></View>}
    </>}
    {notice.length>0&&<Text accessibilityRole="alert" style={styles.muted}>{notice}</Text>}
    <Pressable onPress={()=>router.navigate('/')}><Text style={styles.action}>← Discover</Text></Pressable>
  </ScrollView>;
}
