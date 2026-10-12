import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './src/services/firebase';

import HomeScreen from './src/screens/HomeScreen';
import RoomDetailScreen from './src/screens/RoomDetailScreen';
import AddDeviceScreen from './src/screens/AddDeviceScreen';
import AuthScreen from './src/screens/AuthScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Listens to persistent sessions from AsyncStorage
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await user.reload();
        } catch {
          // Keep offline state if disconnected
        }

        // Only authenticate if user is a guest OR has a confirmed email
        if (user.isAnonymous || user.emailVerified) {
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setIsInitializing(false);
    });

    return unsubscribe;
  }, []);

  if (isInitializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {currentUser ? (
          // AUTHENTICATED: Only accessible once verified or signed in as guest
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="RoomDetail" component={RoomDetailScreen} />
            <Stack.Screen name="AddDevice" component={AddDeviceScreen} />
            {/* Kept so user can view credentials or trigger logout */}
            <Stack.Screen name="Auth" component={AuthScreen} />
          </>
        ) : (
          // LOCKED: App cannot leave AuthScreen until valid sign-in occurs
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
  },
});