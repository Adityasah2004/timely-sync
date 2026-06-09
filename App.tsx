import React, { useEffect, useState } from 'react';
import { View, Text, StatusBar, ActivityIndicator, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoreProvider, useStore } from './src/lib/store';
import { TopBar } from './src/navigation/TopBar';
import { TabBar } from './src/navigation/TabBar';
import { TodayScreen } from './src/screens/Today/TodayScreen';
import { PlanScreen } from './src/screens/Plan/PlanScreen';
import { TodosScreen } from './src/screens/Todos/TodosScreen';
import { ChatScreen } from './src/screens/Chat/ChatScreen';
import { DocsScreen } from './src/screens/Docs/DocsScreen';
import { YouScreen } from './src/screens/You/YouScreen';
import { NotificationsScreen } from './src/screens/Notifications/NotificationsScreen';
import { OnboardingScreen } from './src/screens/Onboarding/OnboardingScreen';
import { AuthScreen } from './src/screens/Auth/AuthScreen';
import { HouseholdScreen } from './src/screens/Auth/HouseholdScreen';
import { EventSheet, AddEventSheet, AddTodoSheet, TodoDetailSheet, AddChannelSheet, DocDetailSheet } from './src/components/Sheets';

const ONBOARDING_KEY = 'timely_onboarding_seen';

function SkeletonLoader() {
  const [pulse, setPulse] = React.useState(0.4);
  React.useEffect(() => {
    const id = setInterval(() => {
      setPulse((p) => (p === 0.4 ? 1.0 : 0.4));
    }, 800);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <View style={{ opacity: pulse }}>
        <Text style={{ fontFamily: 'Courier', fontSize: 13, fontWeight: '700', letterSpacing: 4, color: '#141414' }}>TIMELY</Text>
      </View>
      <ActivityIndicator size="small" color="#141414" />
    </View>
  );
}

function AppInner() {
  const { state, dispatch } = useStore();
  // null = not yet checked, true = needs onboarding, false = already seen
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  // Check AsyncStorage once auth is ready and we know user has no household
  useEffect(() => {
    if (!state.authReady) return;
    if (!state.session) { setNeedsOnboarding(false); return; }
    if (state.profilesLoaded && state.householdId) { setNeedsOnboarding(false); return; }
    if (!state.profilesLoaded) return;

    // User is signed in, profiles loaded, but has no household — check if onboarding was seen
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setNeedsOnboarding(val !== 'true');
    });
  }, [state.authReady, state.session, state.profilesLoaded, state.householdId]);

  async function finishOnboarding() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setNeedsOnboarding(false);
  }

  // Intercept Android back gesture/button: go to Today instead of exiting
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.modal) {
        dispatch({ t: 'closeModal' });
        return true;
      }
      if (state.tab === 'chat' && state.activeChannelId !== null) {
        dispatch({ t: 'setActiveChannel', channelId: null });
        return true;
      }
      if (state.tab !== 'today') {
        dispatch({ t: 'tab', tab: 'today' });
        return true;
      }
      return false; // let the OS minimize/exit on home tab
    });
    return () => sub.remove();
  }, [state.tab, state.modal, state.activeChannelId]);

  // Splash while Supabase restores session or profiles load
  if (!state.authReady || (state.session && !state.profilesLoaded)) {
    return <SkeletonLoader />;
  }

  // Not signed in
  if (!state.session) {
    return <AuthScreen />;
  }

  // Signed in but no household — show onboarding first for new users
  if (!state.householdId) {
    if (needsOnboarding === null) return <SkeletonLoader />;
    if (needsOnboarding) {
      return <OnboardingScreen onDone={finishOnboarding} />;
    }
    return <HouseholdScreen userId={state.userId!} />;
  }

  // Onboarding triggered manually (e.g. from You tab)
  if (state.showOnboarding) {
    return <OnboardingScreen onDone={() => dispatch({ t: 'finishOnboard' })} />;
  }

  const tab = state.tab;
  const showNav = !(tab === 'chat' && state.activeChannelId !== null);
 
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {showNav && <TopBar />}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: tab === 'today' ? 'flex' : 'none' }}><TodayScreen /></View>
        <View style={{ flex: 1, display: tab === 'plan' ? 'flex' : 'none' }}><PlanScreen /></View>
        <View style={{ flex: 1, display: tab === 'todos' ? 'flex' : 'none' }}><TodosScreen /></View>
        <View style={{ flex: 1, display: tab === 'chat' ? 'flex' : 'none' }}><ChatScreen /></View>
        <View style={{ flex: 1, display: tab === 'docs' ? 'flex' : 'none' }}><DocsScreen /></View>
        <View style={{ flex: 1, display: tab === 'you' ? 'flex' : 'none' }}><YouScreen /></View>
        <View style={{ flex: 1, display: tab === 'notifications' ? 'flex' : 'none' }}><NotificationsScreen /></View>
      </View>
      {showNav && <TabBar />}
 
      <EventSheet />
      <AddEventSheet />
      <AddTodoSheet />
      <TodoDetailSheet />
      <AddChannelSheet />
      <DocDetailSheet />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <AppInner />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
