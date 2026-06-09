import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import { colors, radius, shadows, SLOT_COLORS } from '../../lib/tokens';
import { useStore } from '../../lib/store';
import { Icon } from '../../components/Icon';
import { ScreenHeader, UserChip, Card, SecLabel, Divider, styles } from '../../components/Primitives';
import { supabase } from '../../lib/supabase';
import { deriveKey, encryptText, decryptText } from '../../lib/crypto';
import type { UserId, ChatChannel, ChatMessage } from '../../lib/types';

export function parseMarkdown(text: string, baseStyle: any = {}): React.ReactNode[] {
  if (!text) return [];
  
  // Split by lines to handle block-level styling like headings
  const lines = text.split('\n');
  
  return lines.map((line, lineIdx) => {
    let lineStyle = Array.isArray(baseStyle) ? [...baseStyle] : [baseStyle];
    let cleanLine = line;
    
    // Check for headings
    if (line.startsWith('### ')) {
      lineStyle = [...lineStyle, { fontSize: 15, fontWeight: '800', marginVertical: 4 }];
      cleanLine = line.slice(4);
    } else if (line.startsWith('## ')) {
      lineStyle = [...lineStyle, { fontSize: 17, fontWeight: '900', marginVertical: 6 }];
      cleanLine = line.slice(3);
    } else if (line.startsWith('# ')) {
      lineStyle = [...lineStyle, { fontSize: 20, fontWeight: '900', marginVertical: 8 }];
      cleanLine = line.slice(2);
    }
    
    // Parse inline markdown tokens inside this line
    const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|_.*?_|`.*?`)/g;
    const parts = cleanLine.split(inlineRegex);
    const parsedLine = parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text key={`inline-${idx}`} style={[lineStyle, { fontWeight: '800' }]}>{part.slice(2, -2)}</Text>;
      }
      if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        return <Text key={`inline-${idx}`} style={[lineStyle, { fontStyle: 'italic' }]}>{part.slice(1, -1)}</Text>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={`inline-${idx}`} style={[lineStyle, { fontFamily: 'Courier', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 3, borderRadius: 4 }]}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return <Text key={`inline-${idx}`} style={lineStyle}>{part}</Text>;
    });
    
    // Return the line as a nested Text component with a line break at the end (except last line)
    return (
      <Text key={`line-${lineIdx}`}>
        {parsedLine}
        {lineIdx < lines.length - 1 ? '\n' : ''}
      </Text>
    );
  });
}

function getFriendlyDateLabel(createdAt?: string): string {
  if (!createdAt) return 'TODAY';
  const messageDate = new Date(createdAt);
  if (isNaN(messageDate.getTime())) return 'TODAY';

  const today = new Date();
  const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d2 = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return 'TODAY';
  } else if (diffDays === 1) {
    return 'YESTERDAY';
  } else {
    return messageDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).toUpperCase();
  }
}

export function ChatScreen() {
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [bottomInset, setBottomInset] = useState(insets.bottom);
  
  // Autocomplete overlays
  const [showCommands, setShowCommands] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showDocs, setShowDocs] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [showParams, setShowParams] = useState(false);
  const [paramSearch, setParamSearch] = useState('');
  const [paramType, setParamType] = useState<'todo' | 'event' | 'status' | null>(null);
  const [activeParamField, setActiveParamField] = useState<string | null>(null);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const messageYRefs = useRef<Record<string, number>>({});
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  const scrollToMessage = (msgId: string) => {
    const y = messageYRefs.current[msgId];
    if (y == null) return;
    scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    setHighlightedMsgId(msgId);
    setTimeout(() => setHighlightedMsgId(null), 1200);
  };

  // Reply state
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    sender: string;
    senderName: string;
  } | null>(null);

  // Edit state
  const [editingMsg, setEditingMsg] = useState<{ id: string; content: string } | null>(null);

  // Action menu state (long-press icon row)
  const [actionMenu, setActionMenu] = useState<{
    msgId: string;
    content: string;
    isMe: boolean;
    y: number;
  } | null>(null);
  const actionMenuMsgYRef = useRef<Record<string, number>>({});
  const lastTapRef = useRef<Record<string, number>>({});
  const tapCountRef = useRef<Record<string, number>>({});
  const [showOriginalId, setShowOriginalId] = useState<string | null>(null);

  // E2EE Keys Local State Map (stores derived hex keys per channel ID)
  const [channelKeys, setChannelKeys] = useState<Record<string, string>>({});
  
  // Unlock Passphrase Input Screen State
  const [passphraseInput, setPassphraseInput] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // 1. Identify active channel
  const activeChannelId = state.activeChannelId;
  const activeChannel: ChatChannel | undefined = activeChannelId
    ? (activeChannelId === 'general'
        ? { id: 'general', name: 'General Sync Room', createdBy: null, members: null, passphraseCheck: 'general_e2ee' }
        : state.channels.find(c => c.id === activeChannelId))
    : undefined;

  const channelMessages = state.messages.filter(msg => {
    if (activeChannelId === 'general') return !msg.channelId;
    return msg.channelId === activeChannelId;
  });

  // Safe-guard and automatically back out to Lobby if channel details are missing
  useEffect(() => {
    if (activeChannelId && !activeChannel) {
      dispatch({ t: 'setActiveChannel', channelId: null });
    }
  }, [activeChannelId, activeChannel, dispatch]);

  if (activeChannelId && !activeChannel) {
    return null;
  }

  // 2. Load E2EE key for active channel on mount or channel switch
  useEffect(() => {
    async function loadChannelKey() {
      if (!state.householdId || !activeChannelId) return;
      
      try {
        if (activeChannelId === 'general') {
          // General room uses the legacy household passcode
          const stored = await SecureStore.getItemAsync(`sprint_key_${state.householdId}`);
          if (stored) {
            setChannelKeys(prev => ({ ...prev, general: deriveKey(stored) }));
          }
        } else if (activeChannel) {
          // Custom channels use channel-specific passcodes
          if (!activeChannel.passphraseCheck) return; // Public/unencrypted
          
          const stored = await SecureStore.getItemAsync(`channel_key_${activeChannel.id}`);
          if (stored) {
            setChannelKeys(prev => ({ ...prev, [activeChannel.id]: stored }));
          }
        }
      } catch (err) {
        console.warn('SecureStore load error:', err);
      }
    }
    loadChannelKey();
  }, [activeChannelId, state.householdId]);

  // 3. Wipes and locks all E2EE channels automatically the second we exit to the Lobby (activeChannelId === null)
  useEffect(() => {
    if (!activeChannelId) {
      // Wiping all custom channel E2EE keys from SecureStore on exit
      state.channels.forEach(async (c) => {
        if (c.passphraseCheck) {
          await SecureStore.deleteItemAsync(`channel_key_${c.id}`).catch(() => {});
        }
      });
      // Wiping legacy household key
      if (state.householdId) {
        SecureStore.deleteItemAsync(`sprint_key_${state.householdId}`).catch(() => {});
      }
      setChannelKeys({});
    }
  }, [activeChannelId, state.channels, state.householdId]);

  // Handle Channel passcode decryption/unlock
  const handleUnlockChannel = async () => {
    if (!passphraseInput.trim() || !activeChannelId) return;
    setUnlockError('');
    
    try {
      const trimmed = passphraseInput.trim();
      const derived = deriveKey(trimmed);

      if (activeChannelId === 'general') {
        await SecureStore.setItemAsync(`sprint_key_${state.householdId!}`, trimmed);
        setChannelKeys(prev => ({ ...prev, general: derived }));
        setPassphraseInput('');
      } else if (activeChannel && activeChannel.passphraseCheck) {
        // Cache the passcode and unlock
        await SecureStore.setItemAsync(`channel_key_${activeChannel.id}`, derived);
        setChannelKeys(prev => ({ ...prev, [activeChannel.id]: derived }));
        setPassphraseInput('');
      }
    } catch (err) {
      setUnlockError('Verification failed');
    }
  };

  // Handle locking a specific channel
  const handleLockChannel = async (channelId: string) => {
    try {
      if (channelId === 'general') {
        await SecureStore.deleteItemAsync(`sprint_key_${state.householdId}`);
        setChannelKeys(prev => {
          const next = { ...prev };
          delete next.general;
          return next;
        });
      } else {
        await SecureStore.deleteItemAsync(`channel_key_${channelId}`);
        setChannelKeys(prev => {
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    } catch (err) {
      console.warn('Lock error:', err);
    }
  };

  useEffect(() => {
    if (insets.bottom > 0) {
      setBottomInset(insets.bottom);
    }
  }, [insets.bottom]);

  // Monitor keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleTextChange = (val: string) => {
    setText(val);
    
    if (val === '/') {
      setShowCommands(true);
      setShowMentions(false);
      setShowDocs(false);
      setShowParams(false);
    } else if (val.startsWith('/') && !val.includes(' ')) {
      setShowCommands(true);
      setShowMentions(false);
      setShowDocs(false);
      setShowParams(false);
    } else {
      setShowCommands(false);
    }

    const words = val.split(' ');
    const lastWord = words[words.length - 1] || '';
    if (lastWord.startsWith('@')) {
      setShowMentions(true);
      setMentionSearch(lastWord.slice(1));
      setShowCommands(false);
      setShowDocs(false);
      setShowParams(false);
    } else {
      setShowMentions(false);
    }

    if (lastWord.startsWith('#')) {
      setShowDocs(true);
      setDocSearch(lastWord.slice(1));
      setShowCommands(false);
      setShowMentions(false);
      setShowParams(false);
    } else {
      setShowDocs(false);
    }

    // Slash commands parameter autocomplete parser
    const lowerVal = val.toLowerCase();
    
    if (lowerVal.startsWith('/todo')) {
      setShowDocs(false);
      setShowMentions(false);
      setShowCommands(false);
      setParamType('todo');

      // Check if they are typing a parameter value (allows spaces in values up to next parameter)
      const lastParamMatch = val.match(/(title|priority|assigned_to):\s*([^:]*)$/i);

      if (lastParamMatch) {
        setActiveParamField(lastParamMatch[1].toLowerCase());
        setParamSearch(lastParamMatch[2] || '');
        setShowParams(true);
      } else {
        // They are typing the title or other parameters, suggest parameters
        setActiveParamField(null);
        if (lowerVal.startsWith('/todo ')) {
          setShowParams(true);
          const lastWord = words[words.length - 1] || '';
          setParamSearch(lastWord.includes(':') ? '' : lastWord);
        } else {
          setShowParams(false);
        }
      }
    } else if (lowerVal.startsWith('/event')) {
      setShowDocs(false);
      setShowMentions(false);
      setShowCommands(false);
      setParamType('event');

      const lastParamMatch = val.match(/(title|time|date|who):\s*([^:]*)$/i);

      if (lastParamMatch) {
        setActiveParamField(lastParamMatch[1].toLowerCase());
        setParamSearch(lastParamMatch[2] || '');
        setShowParams(true);
      } else {
        setActiveParamField(null);
        if (lowerVal.startsWith('/event ')) {
          setShowParams(true);
          const lastWord = words[words.length - 1] || '';
          setParamSearch(lastWord.includes(':') ? '' : lastWord);
        } else {
          setShowParams(false);
        }
      }
    } else if (lowerVal.startsWith('/status')) {
      setShowDocs(false);
      setShowMentions(false);
      setShowCommands(false);
      setParamType('status');
      setActiveParamField(null);

      if (lowerVal.startsWith('/status ')) {
        setShowParams(true);
        const match = val.match(/\/status\s+(.*)$/i);
        setParamSearch(match ? match[1] || '' : '');
      } else {
        setShowParams(false);
      }
    } else {
      setParamType(null);
      setActiveParamField(null);
      setShowParams(false);
    }
  };

  const handleSelectMention = (displayName: string) => {
    const words = text.split(' ');
    words.pop();
    words.push(`@${displayName} `);
    handleTextChange(words.join(' '));
  };

  const SLASH_COMMANDS = [
    { cmd: '/todo ', desc: 'Create a shared backlog task', icon: 'check' },
    { cmd: '/event ', desc: 'Schedule a roadmap meeting', icon: 'cal' },
    { cmd: '/status', desc: 'Generate daily AI dispatcher status digest', icon: 'bolt' },
    { cmd: '/help', desc: 'Show AI assistant commands and shortcuts', icon: 'user' },
  ];

  const filteredCommands = SLASH_COMMANDS.filter(item =>
    item.cmd.toLowerCase().startsWith(text.toLowerCase())
  );

  const filteredProfiles = Object.entries(state.profiles)
    .filter(([slot, prof]) => {
      if (slot === state.viewer) return false;
      if (!mentionSearch) return true;
      return prof.displayName.toLowerCase().includes(mentionSearch.toLowerCase());
    })
    .map(([slot, prof]) => ({ slot: slot as UserId, ...prof }));

  const paramAutocompleteItems = (() => {
    if (!showParams || !paramType) return [];

    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      type: 'param' | 'value';
      valueToInsert: string;
      icon: 'check' | 'user' | 'cal' | 'timer' | 'bolt' | 'users';
    }> = [];

    const addFounderValueSuggestions = (filterQ: string) => {
      if (!filterQ || 'everyone'.includes(filterQ.toLowerCase())) {
        items.push({
          id: 'everyone',
          title: 'Everyone',
          subtitle: activeParamField === 'who' || activeParamField === 'assigned_to' 
            ? 'All household founders (Default)' 
            : 'All household founders',
          type: 'value',
          valueToInsert: 'Everyone',
          icon: 'users',
        });
      }
      Object.entries(state.profiles).forEach(([slot, prof]) => {
        if (!filterQ || prof.displayName.toLowerCase().includes(filterQ.toLowerCase())) {
          items.push({
            id: slot,
            title: prof.displayName,
            subtitle: prof.roleLabel || `Founder ${slot}`,
            type: 'value',
            valueToInsert: prof.displayName,
            icon: 'user',
          });
        }
      });
    };

    if (paramType === 'todo') {
      if (activeParamField === 'title') {
        const defaultVal = 'New Task';
        if (!paramSearch || defaultVal.toLowerCase().includes(paramSearch.toLowerCase())) {
          items.push({
            id: 'default-todo-title',
            title: defaultVal,
            subtitle: 'Task Title (Default) · Press to select',
            type: 'value',
            valueToInsert: defaultVal,
            icon: 'check',
          });
        }
      } else if (activeParamField === 'priority') {
        const priorities = [
          { title: '1', desc: 'P1 · High priority sprint blocker', val: '1' },
          { title: '2', desc: 'P2 · Medium priority standard task (Default)', val: '2' },
          { title: '3', desc: 'P3 · Low priority backlog item', val: '3' },
        ];
        priorities.forEach(p => {
          if (!paramSearch || p.title.includes(paramSearch)) {
            items.push({
              id: `priority-${p.title}`,
              title: p.title,
              subtitle: p.desc,
              type: 'value',
              valueToInsert: p.val,
              icon: 'bolt',
            });
          }
        });
      } else if (activeParamField === 'assigned_to') {
        addFounderValueSuggestions(paramSearch);
      } else {
        const params = [
          { title: 'title:', desc: 'Task description/title (default: "New Task")' },
          { title: 'priority:', desc: 'Task priority (1: High, 2: Med, 3: Low) (default: P2)' },
          { title: 'assigned_to:', desc: 'Assign task to a co-founder (default: Everyone)' },
        ];
        params.forEach(p => {
          if (!paramSearch || p.title.toLowerCase().includes(paramSearch.toLowerCase())) {
            items.push({
              id: `param-${p.title}`,
              title: p.title,
              subtitle: p.desc,
              type: 'param',
              valueToInsert: p.title,
              icon: 'check',
            });
          }
        });
      }
    } else if (paramType === 'event') {
      if (activeParamField === 'title') {
        const defaultVal = 'Roadmap Meeting';
        if (!paramSearch || defaultVal.toLowerCase().includes(paramSearch.toLowerCase())) {
          items.push({
            id: 'default-event-title',
            title: defaultVal,
            subtitle: 'Meeting Title (Default) · Press to select',
            type: 'value',
            valueToInsert: defaultVal,
            icon: 'cal',
          });
        }
      } else if (activeParamField === 'time') {
        const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
        times.forEach(t => {
          if (!paramSearch || t.includes(paramSearch)) {
            items.push({
              id: `time-${t}`,
              title: t,
              subtitle: t === '12:00' ? 'Start time (HH:MM) (Default)' : 'Start time (HH:MM)',
              type: 'value',
              valueToInsert: t,
              icon: 'timer',
            });
          }
        });
      } else if (activeParamField === 'date') {
        const todayStr = new Date().toISOString().split('T')[0];
        const makeDateStr = (offsetDays: number) => {
          const d = new Date();
          d.setDate(d.getDate() + offsetDays);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        };
        const dates = [
          { title: todayStr, desc: 'Today (Default)' },
          { title: makeDateStr(1), desc: 'Tomorrow' },
          { title: makeDateStr(2), desc: new Date(Date.now() + 2*86400000).toLocaleDateString('en-US', { weekday: 'long' }) },
          { title: makeDateStr(7), desc: 'Next week' },
        ];
        dates.forEach(d => {
          if (!paramSearch || d.title.includes(paramSearch)) {
            items.push({
              id: `date-${d.title}`,
              title: d.title,
              subtitle: d.desc,
              type: 'value',
              valueToInsert: d.title,
              icon: 'cal',
            });
          }
        });
      } else if (activeParamField === 'who') {
        addFounderValueSuggestions(paramSearch);
      } else {
        const params = [
          { title: 'title:', desc: 'Event title (default: "Roadmap Meeting")' },
          { title: 'time:', desc: 'Event start time (default: 12:00)' },
          { title: 'date:', desc: 'Event date (default: Today)' },
          { title: 'who:', desc: 'Invite slot or Everyone (default: Everyone)' },
        ];
        params.forEach(p => {
          if (!paramSearch || p.title.toLowerCase().includes(paramSearch.toLowerCase())) {
            items.push({
              id: `param-${p.title}`,
              title: p.title,
              subtitle: p.desc,
              type: 'param',
              valueToInsert: p.title,
              icon: 'cal',
            });
          }
        });
      }
    } else if (paramType === 'status') {
      addFounderValueSuggestions(paramSearch);
    }

    return items;
  })();

  const handleSelectParamItem = (item: typeof paramAutocompleteItems[number]) => {
    const words = text.split(' ');
    
    if (item.type === 'param') {
      words.pop();
      words.push(item.valueToInsert);
      handleTextChange(words.join(' '));
    } else {
      if (activeParamField) {
        const regex = new RegExp(`(${activeParamField}:\\s*)[^:]*$`, 'i');
        handleTextChange(text.replace(regex, `$1${item.valueToInsert} `));
      } else {
        words.pop();
        words.push(item.valueToInsert);
        handleTextChange(words.join(' ') + ' ');
      }
    }
    
    setShowParams(false);
  };

  const docAutocompleteItems = (() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      type: 'doc' | 'file';
      uri?: string;
      docId?: string;
    }> = [];

    state.docs.forEach(doc => {
      // Add the document itself
      items.push({
        id: doc.id,
        title: doc.title,
        subtitle: 'Document',
        type: 'doc',
        docId: doc.id,
      });

      // Add its attachments if any
      if (doc.attachments && Array.isArray(doc.attachments)) {
        doc.attachments.forEach((att, idx) => {
          const kb = att.size ? `${Math.round(att.size / 1024)} KB` : 'Attachment';
          items.push({
            id: `${doc.id}-att-${idx}`,
            title: att.name,
            subtitle: `File · ${kb} · from "${doc.title}"`,
            type: 'file',
            uri: att.uri,
            docId: doc.id,
          });
        });
      }
    });

    if (!docSearch) return items;
    const q = docSearch.toLowerCase();
    return items.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.subtitle.toLowerCase().includes(q)
    );
  })();

  const handleSelectDocItem = (item: typeof docAutocompleteItems[number]) => {
    const words = text.split(' ');
    words.pop(); // Remove the '#...' word
    
    const newVal = item.type === 'doc'
      ? `[Doc: ${item.title}](doc:${item.id}) `
      : `[File: ${item.title}](${item.uri}) `;
    
    words.push(newVal);
    handleTextChange(words.join(' '));
    setShowDocs(false);
  };

  const handleOpenDoc = (docId: string) => {
    const doc = state.docs.find(d => d.id === docId);
    if (doc) {
      dispatch({ t: 'openDoc', doc });
    } else {
      Alert.alert('Not Found', 'Document could not be located.');
    }
  };

  const renderMessageContent = (content: string, isMe: boolean, onOpenDoc: (docId: string) => void) => {
    const regex = /\[(Doc|File):\s*([^\]]+)\]\(([^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    const baseTextStyle = [ch.messageText, isMe ? ch.textMe : ch.textPartner];

    while ((match = regex.exec(content)) !== null) {
      const matchIndex = match.index;
      const [fullMatch, type, label, target] = match;

      if (matchIndex > lastIndex) {
        parts.push(
          <Text key={`text-${lastIndex}`}>
            {parseMarkdown(content.substring(lastIndex, matchIndex), baseTextStyle)}
          </Text>
        );
      }

      const isDoc = type === 'Doc';
      const cleanTarget = target.startsWith('doc:') ? target.substring(4) : target;

      parts.push(
        <TouchableOpacity
          key={`chip-${matchIndex}`}
          onPress={() => {
            if (isDoc) {
              onOpenDoc(cleanTarget);
            } else {
              Alert.alert('Attachment Link', `Open file: ${label}`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open Link',
                  onPress: () => {
                    import('react-native').then(rn => {
                      rn.Linking.openURL(target).catch(() => {});
                    });
                  }
                }
              ]);
            }
          }}
          style={[
            ch.attachmentChip,
            isMe ? ch.attachmentChipMe : ch.attachmentChipPartner
          ]}
        >
          <Icon name={isDoc ? 'book' : 'note'} size={12} color={isMe ? '#fff' : colors.fg2} />
          <Text style={[ch.attachmentChipLabel, { color: isMe ? '#fff' : colors.fg1 }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[ch.attachmentChipType, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.fg5 }]}>
            {isDoc ? 'DOCUMENT' : 'FILE'}
          </Text>
        </TouchableOpacity>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(
        <Text key={`text-${lastIndex}`}>
          {parseMarkdown(content.substring(lastIndex), baseTextStyle)}
        </Text>
      );
    }

    if (parts.length === 0) {
      return (
        <Text>
          {parseMarkdown(content, baseTextStyle)}
        </Text>
      );
    }

    return (
      <View style={{ flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {parts}
      </View>
    );
  };

  // Auto-scroll on messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [state.messages, activeChannelId]);

  const handleLongPressMessage = (msgId: string, decryptedContent: string, isLocked: boolean, isMine: boolean) => {
    if (isLocked) return;
    dispatch({ t: 'openNewTodo', initialStatus: 'TODO', initialText: decryptedContent.trim() });
  };

  const handleDoubleTapMessage = (msgId: string, decryptedContent: string, isLocked: boolean, isMine: boolean) => {
    if (isLocked || !isMine) return;
    setActionMenu({ msgId, content: decryptedContent, isMe: isMine, y: 0 });
  };

  const handleDeleteMessage = async (msgId: string) => {
    setActionMenu(null);
    try {
      await supabase.from('messages').delete().eq('id', msgId);
    } catch {
      Alert.alert('Error', 'Could not delete message.');
    }
  };

  const handleEditMessage = (msgId: string, content: string) => {
    setActionMenu(null);
    setEditingMsg({ id: msgId, content });
    setText(content);
  };

  const handleSend = async (customText?: string) => {
    const msgText = (customText || text).trim();
    if (!msgText || !state.householdId || !state.userId || !activeChannelId) return;

    // Handle edit flow
    if (editingMsg && !customText) {
      const encryptionKey = activeChannelId === 'general' ? channelKeys.general : channelKeys[activeChannelId];
      const encryptedContent = encryptionKey ? encryptText(msgText, encryptionKey) : msgText;
      // Preserve original_content only on first edit
      const originalMsg = state.messages.find(m => m.id === editingMsg.id);
      const originalContent = originalMsg?.isEdited
        ? originalMsg.originalContent  // already edited before — keep the original
        : editingMsg.content;           // first edit — store current as original
      const encryptedOriginal = (encryptionKey && originalContent)
        ? encryptText(originalContent, encryptionKey)
        : originalContent;
      setEditingMsg(null);
      setText('');
      setLoading(true);
      try {
        await supabase.from('messages').update({
          content: encryptedContent,
          is_edited: true,
          original_content: encryptedOriginal,
        }).eq('id', editingMsg.id);
      } catch (err) {
        Alert.alert('Error', 'Could not edit message.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!customText) setText('');
    const currentReply = replyingTo;
    setReplyingTo(null);
    setLoading(true);

    try {
      const myDisplayName = state.profiles[state.viewer as UserId]?.displayName || `Founder ${state.viewer}`;
      const encryptionKey = activeChannelId === 'general' ? channelKeys.general : channelKeys[activeChannelId];

      const encryptedContent = encryptionKey ? encryptText(msgText, encryptionKey) : msgText;

      // 1. Send the user's message
      const { error } = await supabase.from('messages').insert({
        household_id: state.householdId,
        sender_id: state.userId,
        sender_short: state.viewer,
        content: encryptedContent,
        is_system: false,
        channel_id: activeChannelId === 'general' ? null : activeChannelId,
        ...(currentReply ? {
          reply_to_id: currentReply.id,
          reply_to_content: currentReply.content,
          reply_to_sender: currentReply.sender,
        } : {}),
      });

      if (error) throw error;

      // 2. PARSE FOR MENTIONS (system notifications)
      Object.entries(state.profiles).forEach(async ([slot, prof]) => {
        const mentionTag = `@${prof.displayName}`;
        if (msgText.toLowerCase().includes(mentionTag.toLowerCase()) && slot !== state.viewer) {
          await supabase.from('notifications').insert({
            household_id: state.householdId,
            for_user:     slot,
            kind:         'chat',
            title:        'Sync War Room Tag',
            body:         `${myDisplayName} mentioned you: "${msgText.substring(0, 60)}"`,
            urgent:       true,
          });
        }
      });

      // 3. Local Smart Dispatcher AI Parser
      const lower = msgText.toLowerCase();

      if (lower.startsWith('/todo ')) {
        const commandText = msgText.slice(6).trim();
        let priorityVal = 2; // Default priority: 2
        let assignedToVal: UserId[] | null = null;
        let cleanText = '';

        // Check for title: parameter
        const titleMatch = commandText.match(/title:\s*([^:]*?)(?=(?:\s*(?:priority|assigned_to):|$))/i);
        if (titleMatch) {
          cleanText = titleMatch[1].trim();
        }

        const priorityMatch = commandText.match(/priority:\s*([1-3])/i);
        if (priorityMatch) {
          priorityVal = parseInt(priorityMatch[1], 10);
        }

        const assignedMatch = commandText.match(/assigned_to:\s*([^:]*?)(?=(?:\s*(?:title|priority):|$))/i);
        if (assignedMatch) {
          const nameToMatch = assignedMatch[1].trim();
          if (nameToMatch.toLowerCase() === 'everyone') {
            assignedToVal = null;
          } else {
            const matchSlot = Object.entries(state.profiles).find(([_, prof]) => 
              prof.displayName.toLowerCase() === nameToMatch.toLowerCase()
            );
            if (matchSlot) {
              assignedToVal = [matchSlot[0] as UserId];
            }
          }
        }

        // If no title: parameter was provided, fall back to stripping parameters
        if (!cleanText) {
          cleanText = commandText
            .replace(/title:\s*([^:]*?)(?=(?:\s*(?:priority|assigned_to):|$))/i, '')
            .replace(/priority:\s*[1-3]/i, '')
            .replace(/assigned_to:\s*([^:]*?)(?=(?:\s*(?:title|priority):|$))/i, '')
            .trim();
        }

        if (cleanText) {
          await supabase.from('todos').insert({
            household_id: state.householdId,
            owner_id: state.userId,
            text: cleanText,
            is_shared: true,
            priority: priorityVal,
            due_label: 'TODAY',
            assigned_to: assignedToVal,
          });

          const priorityLabel = priorityVal === 1 ? 'High (P1)' : priorityVal === 2 ? 'Medium (P2)' : 'Low (P3)';
          const assigneeNames = assignedToVal 
            ? assignedToVal.map(slot => state.profiles[slot]?.displayName || `Founder ${slot}`).join(', ') 
            : 'Everyone';

          const dispatcherContent = `DISPATCHER: Added task "${cleanText}" to the shared backlog.\n\nParameters:\n• Priority: ${priorityLabel}\n• Assigned To: ${assigneeNames}`;
          const encryptedDispatcher = encryptionKey ? encryptText(dispatcherContent, encryptionKey) : dispatcherContent;

          await supabase.from('messages').insert({
            household_id: state.householdId,
            sender_short: 'S',
            content: encryptedDispatcher,
            is_system: true,
            channel_id: activeChannelId === 'general' ? null : activeChannelId,
          });
        }
      } else if (lower.startsWith('/event ')) {
        const commandText = msgText.slice(7).trim();
        let eventTime = '12:00:00';
        let eventDate = new Date().toISOString().split('T')[0];
        let inviteWho: UserId | 'B' = 'B';
        let cleanText = '';

        // Check for title: parameter
        const titleMatch = commandText.match(/title:\s*([^:]*?)(?=(?:\s*(?:time|date|who):|$))/i);
        if (titleMatch) {
          cleanText = titleMatch[1].trim();
        }

        const timeMatch = commandText.match(/time:\s*([0-2]?[0-9]:[0-5][0-9])/i);
        if (timeMatch) {
          eventTime = `${timeMatch[1]}:00`;
        } else {
          // Fallback legacy parser: `at 16:30`
          const atMatch = commandText.match(/\s+at\s+([0-2]?[0-9]:[0-5][0-9])/i);
          if (atMatch) {
            eventTime = `${atMatch[1]}:00`;
          }
        }

        const dateMatch = commandText.match(/date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
        if (dateMatch) {
          eventDate = dateMatch[1];
        }

        const whoMatch = commandText.match(/who:\s*([^:]*?)(?=(?:\s*(?:title|time|date):|$))/i);
        if (whoMatch) {
          const whoName = whoMatch[1].trim();
          if (whoName.toLowerCase() === 'everyone' || whoName.toLowerCase() === 'both') {
            inviteWho = 'B';
          } else {
            const matchSlot = Object.entries(state.profiles).find(([_, prof]) => 
              prof.displayName.toLowerCase() === whoName.toLowerCase()
            );
            if (matchSlot) {
              inviteWho = matchSlot[0] as UserId;
            }
          }
        }

        // If no title: parameter was provided, fall back to stripping parameters
        if (!cleanText) {
          cleanText = commandText
            .replace(/title:\s*([^:]*?)(?=(?:\s*(?:time|date|who):|$))/i, '')
            .replace(/time:\s*[0-2]?[0-9]:[0-5][0-9]/i, '')
            .replace(/date:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}/i, '')
            .replace(/who:\s*([^:]*?)(?=(?:\s*(?:title|time|date):|$))/i, '')
            .replace(/\s+at\s+[0-2]?[0-9]:[0-5][0-9]/i, '')
            .trim();
        }

        if (cleanText) {
          await supabase.from('events').insert({
            household_id: state.householdId,
            owner_id: state.userId,
            title: cleanText,
            start_time: eventTime,
            end_time: eventTime,
            event_date: eventDate,
            who: inviteWho,
            is_private: false,
          });

          const inviteeName = inviteWho === 'B' 
            ? 'Everyone' 
            : (state.profiles[inviteWho]?.displayName || `Founder ${inviteWho}`);

          const dispatcherContent = `DISPATCHER: Scheduled "${cleanText}" in the roadmap.\n\nParameters:\n• Date: ${eventDate}\n• Time: ${eventTime.slice(0, 5)}\n• Invitee: ${inviteeName}`;
          const encryptedDispatcher = encryptionKey ? encryptText(dispatcherContent, encryptionKey) : dispatcherContent;

          await supabase.from('messages').insert({
            household_id: state.householdId,
            sender_short: 'S',
            content: encryptedDispatcher,
            is_system: true,
            channel_id: activeChannelId === 'general' ? null : activeChannelId,
          });
        }
      } else if (
        lower.includes('@dispatcher') ||
        lower.includes('@coordinator') ||
        lower === 'help' ||
        lower === '/help' ||
        lower.startsWith('/status')
      ) {
        let content = '';
        if (
          lower.includes('summarize') ||
          lower.includes('agenda') ||
          lower.includes('status') ||
          lower.startsWith('/status')
        ) {
          let targetSlot: UserId | null = null;
          const statusMatch = msgText.match(/\/status\s+@?([a-zA-Z0-9\s]+)/i);
          if (statusMatch) {
            const rawName = statusMatch[1].trim();
            if (rawName.toLowerCase() !== 'everyone' && rawName.toLowerCase() !== 'both') {
              const matchSlot = Object.entries(state.profiles).find(([_, prof]) => 
                prof.displayName.toLowerCase() === rawName.toLowerCase()
              );
              if (matchSlot) {
                targetSlot = matchSlot[0] as UserId;
              }
            }
          }

          const getFounderDigest = (slotId: UserId) => {
            const prof = state.profiles[slotId];
            if (!prof) return '';

            // 1. Availability Calculation
            const activeFocus = state.focusSessions.find(fs => fs.ownerSlot === slotId && fs.endedAt === null);
            
            const todayStr = new Date().toISOString().split('T')[0];
            const todayEvents = state.events.filter(e => e.day === todayStr && (e.who === slotId || e.who === 'B'));

            const now = new Date();
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();
            const currentTimeVal = currentHour * 60 + currentMin;

            const activeEvent = todayEvents.find(e => {
              if (!e.start || !e.end) return false;
              const [sh, sm] = e.start.split(':').map(Number);
              const [eh, em] = e.end.split(':').map(Number);
              const startTimeVal = sh * 60 + sm;
              const endTimeVal = eh * 60 + em;
              return currentTimeVal >= startTimeVal && currentTimeVal <= endTimeVal;
            });

            let availabilityStr = 'CURRENTLY FREE';
            if (activeFocus) {
              availabilityStr = `BUSY IN FOCUS: "${activeFocus.label}"`;
            } else if (activeEvent) {
              availabilityStr = `IN MEETING: "${activeEvent.title}"`;
            }

            // 2. Task Completion (done === true and assigned to them)
            const completedTodos = state.todos.filter(t => {
              const isAssigned = t.assignedTo ? t.assignedTo.includes(slotId) : t.who === slotId;
              return t.done && isAssigned;
            });

            // 3. Active Backlog (done === false and assigned to them)
            const activeBacklog = state.todos.filter(t => {
              const isAssigned = t.assignedTo ? t.assignedTo.includes(slotId) : t.who === slotId;
              return !t.done && isAssigned;
            });

            // 4. Upcoming Agenda today
            const upcomingAgenda = todayEvents.filter(e => {
              if (!e.start) return false;
              const [sh, sm] = e.start.split(':').map(Number);
              const startTimeVal = sh * 60 + sm;
              return startTimeVal > currentTimeVal;
            });

            let digest = `### **${prof.displayName.toUpperCase()}** (${prof.roleLabel || 'Founder'})\n`;
            digest += `**Status**: ${availabilityStr}\n\n`;
            
            digest += `**Completed Today (${completedTodos.length})**:\n`;
            if (completedTodos.length > 0) {
              digest += completedTodos.map(t => `• ${t.text}`).join('\n') + '\n';
            } else {
              digest += `• No tasks completed today.\n`;
            }
            
            digest += `\n**Active Backlog (${activeBacklog.length})**:\n`;
            if (activeBacklog.length > 0) {
              digest += activeBacklog.map(t => `• [P${t.p}] ${t.text}`).join('\n') + '\n';
            } else {
              digest += `• Backlog is clear!\n`;
            }

            digest += `\n**Upcoming Today (${upcomingAgenda.length})**:\n`;
            if (upcomingAgenda.length > 0) {
              digest += upcomingAgenda.map(e => `• \`${e.start}\` - ${e.title}`).join('\n') + '\n';
            } else {
              digest += `• No more meetings scheduled today.\n`;
            }

            return digest;
          };

          if (targetSlot) {
            content = `## SMART DISPATCHER DIGEST\n\n` + getFounderDigest(targetSlot);
          } else {
            content = `## SMART DISPATCHER CO-FOUNDER COCKPIT\n\n`;
            Object.keys(state.profiles).forEach((slot, idx, arr) => {
              content += getFounderDigest(slot as UserId);
              if (idx < arr.length - 1) {
                content += `\n---\n\n`;
              }
            });
          }
        } else {
          content = `**DISPATCHER CO-FOUNDER COCKPIT GUIDE**

I automate co-founder communication and roadmap syncs in real-time using secure, zero-knowledge parsing. Here are my available commands and parameters:

**SHARED BACKLOG AUTOMATION**
• **Command**: \`/todo [task]\`
• **Parameters**:
  - \`priority:[1|2|3]\` (P1: High, P2: Med, P3: Low)
  - \`assigned_to:[FounderName]\`
• **Example**: \`/todo Refactor E2EE keys priority:1 assigned_to:Aditya\`

**ROADMAP MEETING SCHEDULER**
• **Command**: \`/event [title]\`
• **Parameters**:
  - \`time:[HH:MM]\` (Start time)
  - \`date:[YYYY-MM-DD]\` (Event date)
  - \`who:[FounderName|Everyone]\` (Invitee)
• **Example**: \`/event Pitch VC time:14:00 date:2026-06-01 who:Everyone\`
• *Note*: You can still use the legacy format \`/event Meeting at 15:30\`.

**CO-FOUNDER AVAILABILITY DIGEST**
• **Command**: \`/status [FounderName]\` (or just \`/status\` for household dashboard)
• **Description**: Compiles a real-time status summary of focus sessions, today's calendar overlaps, completed items, active backlog, and future agenda.
• **Example**: \`/status Aditya\`

**WIKI & ATTACHMENT MENTIONS**
• **Action**: Type \`#\` inside the input bar to search and attach documents or uploaded files. Document links are parsed into clickable chips that open automatically when tapped.

*Pro-Tip*: Long-press any chat bubble to instantly convert its content into a shared backlog task!`;
        }

        const encryptedContent = encryptionKey ? encryptText(content, encryptionKey) : content;

        await supabase.from('messages').insert({
          household_id: state.householdId,
          sender_short: 'S',
          content: encryptedContent,
          is_system: true,
          channel_id: activeChannelId === 'general' ? null : activeChannelId,
        });
      }
    } catch (err) {
      console.warn('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete channel handler ───────────────────────────────
  const handleDeleteChannel = (chanId: string, chanName: string) => {
    Alert.alert(
      'Delete Channel',
      `Delete "${chanName}"? All messages in this room will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('messages').delete().eq('channel_id', chanId);
              await supabase.from('chat_channels').delete().eq('id', chanId);
              // Realtime will remove it from state.channels automatically
            } catch (err) {
              Alert.alert('Error', 'Could not delete the channel. Try again.');
            }
          },
        },
      ]
    );
  };

  // ─── Render Lobby View State ──────────────────────────────
  if (!activeChannelId) {
    const publicChannels = state.channels.filter(c => c.members === null);
    const privateChannels = state.channels.filter(c => c.members !== null && c.members.includes(state.viewer));
    const allChannelsList = [
      { id: 'general', name: 'General Sync Room', members: null, passphraseCheck: 'general_e2ee', createdBy: null },
      ...publicChannels,
      ...privateChannels,
    ];

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 130 }}>
        <ScreenHeader
          eyebrow={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="lock" size={9} color={colors.fg5} strokeWidth={2.2} />
              <Text style={{ fontFamily: 'Courier', fontSize: 9, fontWeight: '800', color: colors.fg5, letterSpacing: 1.5 }}>
                {`SECURE CHAT LOBBY · ${allChannelsList.length} ACTIVE ROOMS`}
              </Text>
            </View>
          }
          title="Channels"
          ghost="co-founder sync."
          sub="E2EE private war rooms and system automated dispatching feeds."
          right={
            <TouchableOpacity style={ch.createBtn} onPress={() => dispatch({ t: 'openNewChannel' })}>
              <Icon name="plus" size={16} color="#fff" />
              <Text style={ch.createBtnText}>NEW</Text>
            </TouchableOpacity>
          }
        />

        <SecLabel count={allChannelsList.length}>Available Channels</SecLabel>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {allChannelsList.map((chan, idx) => {
            const isE2EE = chan.passphraseCheck !== null;
            const hasAccess = chan.members === null || chan.members.includes(state.viewer);
            if (!hasAccess) return null;

            const unlocked = chan.id === 'general' ? !!channelKeys.general : (isE2EE ? !!channelKeys[chan.id] : true);
            const isGeneral = chan.id === 'general';
            const canDelete = !isGeneral && chan.createdBy === state.userId;

            return (
              <View
                key={chan.id}
                style={[
                  ch.channelRow,
                  idx < allChannelsList.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border06 }
                ]}
              >
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  onPress={() => dispatch({ t: 'setActiveChannel', channelId: chan.id })}
                >
                  <View style={ch.channelIconContainer}>
                    <Icon name={isE2EE ? (unlocked ? 'unlock' : 'lock') : 'message'} size={18} color={colors.fg2} />
                  </View>

                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={ch.channelNameText}>{chan.name}</Text>
                    {isE2EE && (
                      <View style={[ch.lockPill, unlocked ? ch.lockPillUnlocked : ch.lockPillLocked]}>
                        <Icon name={unlocked ? 'unlock' : 'lock'} size={8} color={unlocked ? '#4B5563' : colors.fg5} />
                        <Text style={ch.lockPillText}>{unlocked ? 'UNLOCKED' : 'SECURE E2EE'}</Text>
                      </View>
                    )}
                  </View>

                  <Icon name="chev" size={14} color={colors.fg6} />
                </TouchableOpacity>

              </View>
            );
          })}
        </Card>
      </ScrollView>
    );
  }

  // ─── Render Passcode Unlock Screen ──────────────────────────
  const isE2E = activeChannel!.passphraseCheck !== null;
  const isUnlocked = activeChannelId === 'general' ? !!channelKeys.general : (isE2E ? !!channelKeys[activeChannel!.id] : true);
  const Container = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const containerProps = Platform.OS === 'ios' ? {
    behavior: 'padding' as const,
    keyboardVerticalOffset: Platform.OS === 'ios' ? 0 : 60,
  } : {};

  if (!isUnlocked) {
    return (
      <Container
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        {...containerProps}
      >
        <View style={ch.unlockContainer}>
          {/* Immersive Header inside unlock screen to exit back to Lobby */}
          <View style={[ch.backHeader, { top: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => dispatch({ t: 'setActiveChannel', channelId: null })} style={ch.unlockBackBtn}>
              <Icon name="chevLeft" size={18} color="#fff" />
              <Text style={ch.backBtnText}>BACK TO CHANNELS</Text>
            </TouchableOpacity>
          </View>

          <Card tight style={ch.unlockCard}>
            <View style={ch.lockIconWrapper}>
              <Icon name="lock" size={26} color={colors.foreground} />
            </View>
            <Text style={ch.unlockTitle}>{activeChannel!.name}</Text>
            <Text style={ch.unlockSub}>
              This war room is encrypted with zero-knowledge AES-256. Enter the correct secret passphrase to locally unlock and decrypt messages.
            </Text>

            <TextInput
              secureTextEntry
              style={ch.unlockInput}
              placeholder="Room Passphrase"
              placeholderTextColor={colors.fg5}
              value={passphraseInput}
              onChangeText={setPassphraseInput}
              onSubmitEditing={handleUnlockChannel}
              autoFocus
            />

            {unlockError ? <Text style={ch.unlockErr}>{unlockError}</Text> : null}

            <TouchableOpacity style={ch.unlockBtn} onPress={handleUnlockChannel}>
              <Text style={ch.unlockBtnText}>UNLOCK ROOM</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </Container>
    );
  }

  // ─── Render Active Immersive Chat Screen View ───────────────
  const isGeneral = activeChannelId === 'general';
  const activeKey = isGeneral ? channelKeys.general : channelKeys[activeChannel!.id];
  const canDeleteChannel = !isGeneral && activeChannel!.createdBy === state.userId;
  
  const visibleMessages = channelMessages.filter(msg => {
    if (!msg.content.startsWith('__E2EE__::')) return true;
    if (!activeKey) return false;
    const decrypted = decryptText(msg.content, activeKey);
    return !decrypted.startsWith('🔒 [Decryption failed');
  });

  return (
    <Container
      style={{ flex: 1, backgroundColor: '#fff', paddingBottom: Platform.OS === 'android' ? (keyboardHeight > 0 ? keyboardHeight + 12 : 0) : 0 }}
      {...containerProps}
    >
      <View style={ch.container}>
        {/* Header */}
        <View style={[ch.activeHeaderBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => dispatch({ t: 'setActiveChannel', channelId: null })} style={ch.headerBackBtn}>
            <Icon name="chevLeft" size={20} color={colors.fg1} />
          </TouchableOpacity>

          {/* Tapping the title opens group info — like WhatsApp */}
          <TouchableOpacity style={{ flex: 1 }} onPress={() => !isGeneral && setShowGroupInfo(true)} activeOpacity={isGeneral ? 1 : 0.6}>
            <Text style={ch.activeChannelTitle} numberOfLines={1}>{activeChannel!.name}</Text>
            <View style={styles.row}>
              {isE2E ? (
                <View style={[styles.row, { gap: 4 }]}>
                  <Icon name="lock" size={8} color={colors.fg5} />
                  <Text style={ch.activeChannelSub}>E2EE SECURED{!isGeneral ? ' · TAP FOR INFO' : ''}</Text>
                </View>
              ) : (
                <View style={[styles.row, { gap: 4 }]}>
                  <Icon name="users" size={8} color={colors.fg5} />
                  <Text style={ch.activeChannelSub}>PUBLIC ROOM{!isGeneral ? ' · TAP FOR INFO' : ''}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {isE2E && (
            <TouchableOpacity onPress={() => handleLockChannel(activeChannelId)} style={ch.headerLockBtn}>
              <Icon name="lock" size={10} color={colors.foreground} />
              <Text style={ch.headerLockBtnText}>LOCK</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 20 }}
        >
          {visibleMessages.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 80 }}>
              <Icon name="message" size={40} color={colors.fg8} />
              <Text style={ch.emptyText}>Feed is clear. Start planning your next sprint.</Text>
            </View>
          ) : (
            (() => {
              let lastDateLabel = '';
              return visibleMessages.map((msg) => {
                const dateLabel = getFriendlyDateLabel(msg.createdAt);
                const showHeader = dateLabel !== lastDateLabel;
                lastDateLabel = dateLabel;

                const isMe = msg.senderShort === state.viewer;
                const isSystem = msg.isSystem || msg.senderShort === 'S';

                const decryptedContent = activeKey ? decryptText(msg.content, activeKey) : msg.content;
                const isLocked = decryptedContent.startsWith('🔒 [Decryption failed');

                const senderProfile = state.profiles[msg.senderShort as UserId];
                const slotColor = SLOT_COLORS[msg.senderShort] || SLOT_COLORS['1'];

                return (
                  <View
                    key={msg.id}
                    style={{ width: '100%' }}
                    onLayout={e => { messageYRefs.current[msg.id] = e.nativeEvent.layout.y; }}
                  >
                    {showHeader && (
                      <View style={ch.dateHeaderContainer}>
                        <View style={ch.dateHeaderLine} />
                        <View style={ch.dateHeaderPill}>
                          <Text style={ch.dateHeaderText}>{dateLabel}</Text>
                        </View>
                        <View style={ch.dateHeaderLine} />
                      </View>
                    )}

                    {isSystem ? (
                      <View style={ch.systemContainer}>
                        <Card tight style={ch.systemCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Icon name="bolt" size={12} color={colors.foreground} />
                            <Text style={ch.systemBadge}>DISPATCHER</Text>
                            <Text style={ch.systemTime}>{msg.timestamp}</Text>
                          </View>
                          <Text style={ch.systemContent}>{parseMarkdown(decryptedContent, ch.systemContent)}</Text>
                        </Card>
                      </View>
                    ) : (
                      <Swipeable
                        ref={ref => { swipeableRefs.current[msg.id] = ref; }}
                        friction={2.5}
                        overshootFriction={10}
                        leftThreshold={52}
                        rightThreshold={52}
                        renderLeftActions={isMe ? undefined : (progress) => {
                          const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 1] });
                          return (
                            <View style={ch.replyAction}>
                              <Animated.View style={[ch.replyCircle, { opacity }]}>
                                <Icon name="arrow" size={14} color={colors.fg2} />
                              </Animated.View>
                            </View>
                          );
                        }}
                        renderRightActions={isMe ? (progress) => {
                          const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 1] });
                          return (
                            <View style={[ch.replyAction, { alignItems: 'flex-end' }]}>
                              <Animated.View style={[ch.replyCircle, { opacity }]}>
                                <View style={{ transform: [{ scaleX: -1 }] }}>
                                  <Icon name="arrow" size={14} color={colors.fg2} />
                                </View>
                              </Animated.View>
                            </View>
                          );
                        } : undefined}
                        onSwipeableOpen={() => {
                          swipeableRefs.current[msg.id]?.close();
                          const senderName = isMe ? 'You' : (senderProfile?.displayName || `Member ${msg.senderShort}`);
                          setReplyingTo({
                            id: msg.id,
                            content: isLocked ? '[Encrypted message]' : decryptedContent,
                            sender: msg.senderShort,
                            senderName,
                          });
                        }}
                      >
                        <View style={[ch.messageRow, isMe ? ch.rowRight : ch.rowLeft]}>
                          {!isMe && (
                            <View style={{ marginRight: 8, alignSelf: 'flex-end', marginBottom: 2 }}>
                              <UserChip id={msg.senderShort as UserId} size="sm" />
                            </View>
                          )}

                          {/* Inline edit/delete icons — left side of own bubble */}
                          {isMe && actionMenu?.msgId === msg.id && (
                            <View style={ch.inlineActions}>
                              <TouchableOpacity style={ch.inlineActionBtn} onPress={() => handleEditMessage(msg.id, actionMenu.content)}>
                                <Icon name="edit" size={15} color={colors.fg2} />
                              </TouchableOpacity>
                              <TouchableOpacity style={ch.inlineActionBtn} onPress={() => handleDeleteMessage(msg.id)}>
                                <Icon name="trash" size={15} color={colors.destructive} />
                              </TouchableOpacity>
                            </View>
                          )}

                          <View style={[
                            { maxWidth: '72%', alignSelf: isMe ? 'flex-end' : 'flex-start' },
                            highlightedMsgId === msg.id && ch.highlightedMsg,
                          ]}>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => {
                                if (actionMenu?.msgId === msg.id) {
                                  setActionMenu(null);
                                  return;
                                }
                                const now = Date.now();
                                const last = lastTapRef.current[msg.id] ?? 0;
                                const withinWindow = now - last < 350;
                                const count = withinWindow ? (tapCountRef.current[msg.id] ?? 1) + 1 : 1;
                                tapCountRef.current[msg.id] = count;
                                lastTapRef.current[msg.id] = now;
                                if (count === 2) {
                                  handleDoubleTapMessage(msg.id, decryptedContent, isLocked, isMe);
                                } else if (count === 3) {
                                  tapCountRef.current[msg.id] = 0;
                                  handleLongPressMessage(msg.id, decryptedContent, isLocked, isMe);
                                }
                              }}
                              onLongPress={() => {
                                if (msg.isEdited && msg.originalContent) {
                                  setShowOriginalId(prev => prev === msg.id ? null : msg.id);
                                }
                              }}
                              style={[
                                ch.bubble,
                                isMe ? ch.bubbleMe : [ch.bubblePartner, { borderColor: slotColor.border }],
                                isLocked && (isMe ? ch.bubbleLockedMe : ch.bubbleLockedPartner),
                              ]}
                            >
                            {/* Quoted reply snippet — inside bubble, WhatsApp/Telegram style */}
                            {msg.replyToContent ? (
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => msg.replyToId && scrollToMessage(msg.replyToId)}
                                style={[
                                  ch.replyQuote,
                                  isMe ? ch.replyQuoteMe : ch.replyQuotePartner,
                                ]}
                              >
                                <View style={[ch.replyQuoteBar, { backgroundColor: isMe ? '#fff' : colors.foreground }]} />
                                <View style={{ flexShrink: 1, flexGrow: 1, flexBasis: 0 }}>
                                  <Text style={[ch.replyQuoteName, { color: isMe ? '#fff' : colors.fg1 }]}>
                                    {msg.replyToSender === state.viewer ? 'You' : (state.profiles[msg.replyToSender as UserId]?.displayName || `Member ${msg.replyToSender}`)}
                                  </Text>
                                  <Text
                                    style={[ch.replyQuoteText, { color: isMe ? 'rgba(255,255,255,0.75)' : colors.fg3 }]}
                                    numberOfLines={2}
                                  >
                                    {msg.replyToContent}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ) : null}

                            {isLocked ? (
                              <View style={{ paddingVertical: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                  <Icon name="lock" size={13} color={isMe ? 'rgba(255,255,255,0.45)' : colors.fg5} />
                                  <Text style={[ch.lockedTitleText, { color: isMe ? 'rgba(255,255,255,0.55)' : colors.fg5 }]}>
                                    ENCRYPTED CHAT
                                  </Text>
                                </View>
                                <Text style={[ch.lockedSubText, { color: isMe ? 'rgba(255,255,255,0.35)' : colors.fg6 }]}>
                                  Enter correct secret passphrase to decrypt this co-founder message.
                                </Text>
                              </View>
                            ) : (
                              renderMessageContent(decryptedContent, isMe, handleOpenDoc)
                            )}

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 8 }}>
                              <Text style={[ch.messageSender, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.fg4 }]}>
                                {isMe ? 'YOU' : (senderProfile?.displayName || `Founder ${msg.senderShort}`)}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                {msg.isEdited && (
                                  <Text style={{ fontSize: 9, color: isMe ? 'rgba(255,255,255,0.45)' : colors.fg5, fontStyle: 'italic' }}>
                                    edited
                                  </Text>
                                )}
                                {isE2E && (
                                  <Icon name="lock" size={8} color={isMe ? 'rgba(255,255,255,0.45)' : colors.fg6} />
                                )}
                                <Text style={[ch.messageTime, isMe ? ch.timeMe : ch.timePartner]}>
                                  {msg.timestamp}
                                </Text>
                              </View>
                            </View>
                            </TouchableOpacity>
                            {showOriginalId === msg.id && msg.originalContent && (
                              <View style={[ch.originalMsgBox, { alignSelf: isMe ? 'flex-end' : 'flex-start' }]}>
                                <Text style={ch.originalMsgLabel}>ORIGINAL MESSAGE</Text>
                                <Text style={ch.originalMsgText}>
                                  {activeKey ? decryptText(msg.originalContent, activeKey) : msg.originalContent}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </Swipeable>
                    )}
                  </View>
                );
              });
            })()
          )}
        </ScrollView>

        {/* Input Bar & Autocomplete overlays */}
        <View style={[ch.inputWrapper, { marginBottom: keyboardVisible ? 8 : (12 + bottomInset) }]}>
          
          {/* Slash Commands autocomplete */}
          {showCommands && filteredCommands.length > 0 && (
            <Card tight style={ch.autocompleteCard}>
              <Text style={ch.autocompleteHeader}>SLASH COMMANDS</Text>
              {filteredCommands.map((item, idx) => (
                <TouchableOpacity
                  key={item.cmd}
                  style={[
                    ch.autocompleteRow,
                    idx < filteredCommands.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border06 }
                  ]}
                  onPress={() => {
                    handleTextChange(item.cmd);
                  }}
                >
                  <Icon name={item.icon as any} size={12} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={ch.autocompleteCmd}>{item.cmd}</Text>
                    <Text style={ch.autocompleteDesc}>{item.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          )}

          {/* Co-founder mentions autocomplete */}
          {showMentions && filteredProfiles.length > 0 && (
            <Card tight style={ch.autocompleteCard}>
              <Text style={ch.autocompleteHeader}>MENTION TEAM</Text>
              {filteredProfiles.map((item, idx) => (
                <TouchableOpacity
                  key={item.slot}
                  style={[
                    ch.autocompleteRow,
                    idx < filteredProfiles.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border06 }
                  ]}
                  onPress={() => handleSelectMention(item.displayName)}
                >
                  <UserChip id={item.slot} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={ch.mentionName}>{item.displayName}</Text>
                    {item.roleLabel ? <Text style={ch.mentionRole}>{item.roleLabel}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          )}

          {/* Docs/attachments autocomplete */}
          {showDocs && docAutocompleteItems.length > 0 && (
            <Card tight style={ch.autocompleteCard}>
              <Text style={ch.autocompleteHeader}>ATTACH DOCUMENTS & FILES</Text>
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {docAutocompleteItems.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      ch.autocompleteRow,
                      idx < docAutocompleteItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border06 }
                    ]}
                    onPress={() => handleSelectDocItem(item)}
                  >
                    <View style={ch.channelIconContainer}>
                      <Icon name={item.type === 'doc' ? 'book' : 'note'} size={14} color={colors.foreground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ch.mentionName}>{item.title}</Text>
                      <Text style={ch.mentionRole}>{item.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Card>
          )}

          {/* Parameter Autocomplete overlay */}
          {showParams && paramAutocompleteItems.length > 0 && (
            <Card tight style={ch.autocompleteCard}>
              <Text style={ch.autocompleteHeader}>
                {activeParamField 
                  ? `SELECT VALUE FOR ${activeParamField.toUpperCase()}`
                  : `${paramType!.toUpperCase()} PARAMETERS`}
              </Text>
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {paramAutocompleteItems.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      ch.autocompleteRow,
                      idx < paramAutocompleteItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border06 }
                    ]}
                    onPress={() => handleSelectParamItem(item)}
                  >
                    <View style={ch.channelIconContainer}>
                      <Icon name={item.icon} size={14} color={colors.foreground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ch.mentionName}>{item.title}</Text>
                      <Text style={ch.mentionRole}>{item.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Card>
          )}

          {/* Edit indicator bar */}
          {editingMsg && (
            <View style={ch.replyBar}>
              <View style={[ch.replyBarAccent, { backgroundColor: '#2563EB' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[ch.replyBarName, { color: '#2563EB' }]}>EDITING</Text>
                <Text style={ch.replyBarText} numberOfLines={1}>{editingMsg.content}</Text>
              </View>
              <TouchableOpacity onPress={() => { setEditingMsg(null); setText(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={16} color={colors.fg4} />
              </TouchableOpacity>
            </View>
          )}

          {/* Reply preview bar */}
          {replyingTo && (
            <View style={ch.replyBar}>
              <View style={ch.replyBarAccent} />
              <View style={{ flex: 1 }}>
                <Text style={ch.replyBarName}>{replyingTo.senderName}</Text>
                <Text style={ch.replyBarText} numberOfLines={1}>{replyingTo.content}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={16} color={colors.fg4} />
              </TouchableOpacity>
            </View>
          )}

          <View style={ch.inputContainer}>
            <TextInput
              style={ch.input}
              placeholder={editingMsg ? 'Edit message…' : replyingTo ? `Replying to ${replyingTo.senderName}…` : (isE2E ? "Send secure message or use /todo, /event..." : "Send public message...")}
              placeholderTextColor={colors.fg6}
              value={text}
              onChangeText={handleTextChange}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[ch.sendBtn, !text.trim() && { opacity: 0.4 }]}
              onPress={() => handleSend()}
              disabled={!text.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name="arrow" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Group Info Modal ───────────────────────────────── */}
      <Modal
        visible={showGroupInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGroupInfo(false)}
      >
        <TouchableOpacity
          style={ch.groupInfoOverlay}
          activeOpacity={1}
          onPress={() => setShowGroupInfo(false)}
        />
        <View style={[ch.groupInfoSheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle bar */}
          <View style={ch.groupInfoHandle} />

          {/* Room name + edit */}
          <View style={ch.groupInfoHeader}>
            <View style={ch.groupInfoIconWrap}>
              <Icon name="message" size={22} color={colors.fg2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ch.groupInfoRoomName}>{activeChannel?.name}</Text>
              <Text style={ch.groupInfoRoomSub}>
                {isE2E ? 'E2EE ENCRYPTED' : 'PUBLIC ROOM'} · {Object.keys(state.profiles).length} MEMBERS
              </Text>
            </View>
          </View>

          <View style={ch.groupInfoDivider} />

          {/* Members list */}
          <Text style={ch.groupInfoSectionLabel}>MEMBERS</Text>
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            {Object.entries(state.profiles).map(([slot, prof]) => (
              <View key={slot} style={ch.groupInfoMemberRow}>
                <UserChip id={slot as UserId} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text style={ch.groupInfoMemberName}>{prof.displayName}</Text>
                  {prof.roleLabel ? (
                    <Text style={ch.groupInfoMemberRole}>{prof.roleLabel}</Text>
                  ) : null}
                </View>
                {slot === state.viewer && (
                  <View style={ch.groupInfoYouPill}>
                    <Text style={ch.groupInfoYouText}>YOU</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <View style={ch.groupInfoDivider} />

          {/* Actions */}
          {canDeleteChannel && (
            <TouchableOpacity
              style={ch.groupInfoDeleteBtn}
              onPress={() => {
                setShowGroupInfo(false);
                handleDeleteChannel(activeChannel!.id, activeChannel!.name);
              }}
            >
              <Icon name="trash" size={16} color={colors.destructive} />
              <Text style={ch.groupInfoDeleteText}>Delete Room</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={ch.groupInfoCloseBtn}
            onPress={() => setShowGroupInfo(false)}
          >
            <Text style={ch.groupInfoCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Container>
  );
}

const ch = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    backgroundColor: colors.foreground,
    borderRadius: radius.md,
    ...shadows.sm,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    minHeight: 64,
  },
  deleteChannelBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  channelIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelNameText: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.fg1,
  },
  channelSnippetText: {
    fontSize: 12.5,
    color: colors.fg5,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 9999,
  },
  lockPillText: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  lockPillLocked: {
    borderColor: colors.border08,
    backgroundColor: colors.bgTint02,
    color: colors.fg5,
  },
  lockPillUnlocked: {
    borderColor: 'rgba(75,85,99,0.2)',
    backgroundColor: 'rgba(75,85,99,0.06)',
    color: '#4B5563',
  },
  backHeader: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  unlockBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backBtnText: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#fff',
  },
  activeHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border06,
    backgroundColor: '#fff',
    gap: 12,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.bgTint04,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border08,
  },
  activeChannelTitle: {
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.fg1,
  },
  activeChannelSub: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    color: colors.fg5,
    letterSpacing: 1,
  },
  headerLockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.bgTint02,
  },
  headerLockBtnText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.foreground,
    letterSpacing: 1,
  },
  emptyText: {
    fontFamily: 'Courier',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.fg6,
    textAlign: 'center',
    marginTop: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    ...shadows.sm,
  },
  bubbleMe: {
    backgroundColor: colors.foreground,
    borderBottomRightRadius: 4,
  },
  bubblePartner: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textMe: {
    color: '#fff',
  },
  textPartner: {
    color: colors.foreground,
  },
  messageSender: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubbleLockedMe: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
  },
  bubbleLockedPartner: {
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border08,
    borderStyle: 'dashed',
  },
  lockedTitleText: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  lockedSubText: {
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    marginTop: 2,
  },
  messageTime: {
    fontSize: 8,
    fontFamily: 'Courier',
  },
  timeMe: {
    color: 'rgba(255,255,255,0.6)',
  },
  timePartner: {
    color: colors.fg6,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
    width: '100%',
  },
  systemCard: {
    width: '94%',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border12,
  },
  systemBadge: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.foreground,
  },
  systemTime: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: colors.fg6,
    marginLeft: 'auto',
  },
  systemContent: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.foreground,
  },
  inputWrapper: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.border06,
    paddingVertical: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border10,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.foreground,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  autocompleteCard: {
    backgroundColor: '#fff',
    borderColor: colors.border12,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 8,
    marginHorizontal: 16,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  autocompleteHeader: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.fg5,
    letterSpacing: 1.5,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  autocompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  autocompleteCmd: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: colors.foreground,
  },
  autocompleteDesc: {
    fontSize: 10,
    color: colors.fg5,
    marginTop: 2,
  },
  mentionName: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: colors.foreground,
  },
  mentionRole: {
    fontSize: 10,
    color: colors.fg5,
    marginTop: 2,
  },
  // E2EE Lock / Unlock styles
  unlockContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unlockCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...shadows.md,
  },
  lockIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgTint04,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  unlockTitle: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 8,
  },
  unlockSub: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.fg5,
    textAlign: 'center',
    marginBottom: 20,
  },
  unlockInput: {
    width: '100%',
    height: 48,
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border12,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 12,
  },
  unlockBtn: {
    width: '100%',
    height: 48,
    backgroundColor: colors.foreground,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  unlockBtnText: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
  },
  unlockErr: {
    color: colors.destructive,
    fontSize: 11,
    fontFamily: 'Courier',
    marginBottom: 8,
  },
  dateHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
    width: '100%',
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border06,
  },
  dateHeaderPill: {
    borderWidth: 1,
    borderColor: colors.border12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#fff',
    marginHorizontal: 10,
    ...shadows.sm,
  },
  dateHeaderText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.fg5,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 4,
  },
  attachmentChipMe: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  attachmentChipPartner: {
    backgroundColor: colors.bgTint04,
    borderColor: colors.border08,
  },
  attachmentChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 160,
  },
  attachmentChipType: {
    fontSize: 8,
    fontFamily: 'Courier',
    fontWeight: '800',
    letterSpacing: 1,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  inlineActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightedMsg: {
    backgroundColor: 'rgba(0,0,0,0.07)',
    borderRadius: 18,
    padding: 4,
  },
  // ── Reply swipe action hint
  replyAction: {
    width: 56,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  replyCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgTint06,
    borderWidth: 1,
    borderColor: colors.border10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Quoted reply snippet — bleeds to bubble edges
  replyQuote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: -10,
    marginLeft: -14,
    marginRight: -14,
    marginBottom: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minWidth: 160,
  },
  replyQuoteMe: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  replyQuotePartner: {
    backgroundColor: 'rgba(0,0,0,0.055)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border08,
  },
  replyQuoteBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 28,
    flexShrink: 0,
  },
  replyQuoteName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyQuoteText: {
    fontSize: 12,
    lineHeight: 17,
  },
  // ── Original message reveal (triple-tap on edited message)
  originalMsgBox: {
    marginTop: 4,
    maxWidth: '78%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border08,
    backgroundColor: colors.bgTint02,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  originalMsgLabel: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.fg5,
    marginBottom: 4,
  },
  originalMsgText: {
    fontSize: 13,
    color: colors.fg3,
    lineHeight: 18,
  },
  // ── Reply preview bar above input
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border06,
    backgroundColor: colors.bgTint02,
  },
  replyBarAccent: {
    width: 3,
    height: 32,
    borderRadius: 2,
    backgroundColor: colors.foreground,
  },
  replyBarName: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.fg2,
    marginBottom: 2,
  },
  replyBarText: {
    fontSize: 12,
    color: colors.fg5,
    lineHeight: 16,
  },
  // ── Group Info Modal
  groupInfoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  groupInfoSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    ...shadows.lg,
  },
  groupInfoHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border12,
    alignSelf: 'center',
    marginBottom: 16,
  },
  groupInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  groupInfoIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfoRoomName: {
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: -0.3,
    color: colors.fg1,
  },
  groupInfoRoomSub: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    color: colors.fg5,
    letterSpacing: 1,
    marginTop: 2,
  },
  groupInfoDivider: {
    height: 1,
    backgroundColor: colors.border06,
    marginVertical: 12,
  },
  groupInfoSectionLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.fg5,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  groupInfoMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  groupInfoMemberName: {
    fontWeight: '700',
    fontSize: 14,
    color: colors.fg1,
  },
  groupInfoMemberRole: {
    fontSize: 11,
    color: colors.fg5,
    marginTop: 1,
  },
  groupInfoYouPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
  },
  groupInfoYouText: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    color: colors.fg4,
    letterSpacing: 1,
  },
  groupInfoDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  groupInfoDeleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.destructive,
  },
  groupInfoCloseBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  groupInfoCloseBtnText: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: colors.fg2,
    letterSpacing: 1,
  },
});
