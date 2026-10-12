import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  registerWithVerification,
  loginWithVerifiedCheck,
  loginAsGuest,
  resendVerificationEmail,
  logoutUser,
} from '../services/authService';
import { saveUserSession, clearAllUserData } from '../services/storage';

export const AuthScreen = ({ navigation }: any) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await user.reload();
        } catch {
          // Ignore offline reload failures
        }
        if (user.isAnonymous || user.emailVerified) {
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
    });

    return unsubscribe;
  }, []);

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    if (cleanPass.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await registerWithVerification(cleanEmail, cleanPass);
        setVerificationPending(true);
      } else {
        await clearAllUserData();

        const user = await loginWithVerifiedCheck(cleanEmail, cleanPass);

        if (user) {
          const resolvedUser = (user as any).user || user;
          await saveUserSession({
            userId: resolvedUser.uid,
            email: resolvedUser.email || cleanEmail,
            isLoggedIn: true,
          });
        }

        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      }
    } catch (err: any) {
      if (err.message === 'EMAIL_NOT_VERIFIED') {
        Alert.alert(
          'Email Not Verified',
          'Please verify your email address via the link sent to your inbox before logging in.',
          [
            { text: 'OK' },
            {
              text: 'Resend Email',
              onPress: async () => {
                try {
                  await resendVerificationEmail(cleanEmail, cleanPass);
                  Alert.alert('Sent', 'Verification link resent.');
                } catch (resendErr: any) {
                  Alert.alert('Error', resendErr.message);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('Authentication Error', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      await clearAllUserData();

      const user = await loginAsGuest();

      if (user) {
        const resolvedUser = (user as any).user || user;
        await saveUserSession({
          userId: resolvedUser.uid,
          email: 'Guest',
          isLoggedIn: true,
        });
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (err: any) {
      Alert.alert('Guest Login Failed', err.message);
    } finally {
      setGuestLoading(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Do you want to log out of your session? All cached devices will be cleared from this mobile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllUserData();
              await logoutUser();
              setEmail('');
              setPassword('');
              setCurrentUser(null);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  if (currentUser) {
    const isGuest = currentUser.isAnonymous;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>SapthaNest</Text>
            <Text style={styles.tagline}>Active Account Session</Text>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {isGuest ? 'G' : (currentUser.email?.[0]?.toUpperCase() || 'U')}
              </Text>
            </View>

            <Text style={styles.cardHeader}>
              {isGuest ? 'Guest User' : currentUser.email}
            </Text>

            <View style={[styles.badge, isGuest ? styles.badgeGuest : styles.badgeVerified]}>
              <Text style={[styles.badgeText, isGuest ? styles.textGuest : styles.textVerified]}>
                {isGuest ? 'Guest Mode (Local Wi-Fi Only)' : 'Verified Cloud Account'}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email ID</Text>
              <Text style={styles.detailValue}>
                {isGuest ? 'None (Local / Guest)' : currentUser.email}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account UID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {currentUser.uid}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Access Mode</Text>
              <Text style={styles.detailValue}>
                {isGuest ? 'Local Network Only' : 'Cloud & Remote Sync'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.primaryBtnText}>Back to Dashboard →</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (verificationPending) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.profileCard}>
            <Text style={styles.icon}>✉️</Text>
            <Text style={styles.brandTitle}>Verify Your Email</Text>
            <Text style={styles.tagline}>A verification link was sent to:</Text>
            <Text style={styles.emailHighlight}>{email}</Text>
            <Text style={styles.instructions}>
              1. Tap the confirmation link in your inbox.{'\n'}
              2. Return here to log in with your password.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setVerificationPending(false);
                setIsSignUp(false);
              }}
            >
              <Text style={styles.primaryBtnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.brandTitle}>SapthaNest</Text>
          <Text style={styles.tagline}>
            {isSignUp ? 'Create an account to start' : 'Sign in to control your devices'}
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading || guestLoading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isSignUp ? 'Create Account & Verify' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.guestBtn, guestLoading && { opacity: 0.7 }]}
          onPress={handleGuestLogin}
          disabled={loading || guestLoading}
        >
          {guestLoading ? (
            <ActivityIndicator color="#38bdf8" />
          ) : (
            <Text style={styles.guestBtnText}>Continue as Guest (Local Only)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setIsSignUp(!isSignUp)}
        >
          <Text style={styles.toggleText}>
            {isSignUp ? 'Already verified? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0f19' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { marginBottom: 24, alignItems: 'center' },
  brandTitle: { fontSize: 28, fontWeight: '900', color: '#f8fafc', letterSpacing: 0.5 },
  tagline: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  profileCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
  cardHeader: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginBottom: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 16 },
  badgeVerified: { backgroundColor: '#064e3b' },
  badgeGuest: { backgroundColor: '#334155' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  textVerified: { color: '#34d399' },
  textGuest: { color: '#94a3b8' },
  divider: { height: 1, backgroundColor: '#334155', width: '100%', marginBottom: 14 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 8,
  },
  detailLabel: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  detailValue: { color: '#f8fafc', fontSize: 13, fontWeight: '600', maxWidth: '60%' },
  primaryBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  signOutBtn: {
    backgroundColor: '#3f1d24',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutBtnText: { color: '#f87171', fontSize: 15, fontWeight: '700' },
  guestBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  guestBtnText: { color: '#38bdf8', fontSize: 14, fontWeight: '700' },
  toggleBtn: { marginTop: 20, alignItems: 'center' },
  toggleText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    color: '#ffffff',
    padding: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  icon: { fontSize: 40, marginBottom: 12 },
  emailHighlight: { fontSize: 15, fontWeight: '700', color: '#38bdf8', marginVertical: 6 },
  instructions: { color: '#94a3b8', fontSize: 13, lineHeight: 20, textAlign: 'center', marginVertical: 16 },
});

export default AuthScreen;