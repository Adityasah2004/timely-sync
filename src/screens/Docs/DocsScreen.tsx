import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { colors, radius, shadows } from '../../lib/tokens';
import { useStore } from '../../lib/store';
import { Icon } from '../../components/Icon';
import { ScreenHeader, Card, Tag, Divider, IconBtn } from '../../components/Primitives';
import { parseMarkdown } from '../../components/Sheets';
import { supabase } from '../../lib/supabase';
import type { StartupDoc, DocAttachment } from '../../lib/types';

const DEFAULT_TAGS = ['spec', 'pitch', 'metrics', 'feedback', 'ideas', 'retro'];

// Strip markdown syntax to get clean plain text
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')         // headings
    .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1') // bold / italic
    .replace(/~~(.*?)~~/g, '$1')           // strikethrough
    .replace(/`{1,3}[^`]*`{1,3}/g, '')    // inline code / fenced
    .replace(/^[-*+>]\s+/gm, '')          // bullets / blockquotes
    .replace(/^\d+\.\s+/gm, '')           // ordered list
    .replace(/^-{3,}$/gm, '')             // hr
    .replace(/\n{2,}/g, ' ')              // collapse blank lines
    .trim();
}

// ─── Interactive Audio Player Card (expo-audio SDK 56) ────────
function AudioPlayerCard({ uri, name }: { uri: string; name: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const handlePlayPause = async () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '0:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = status.duration ? status.currentTime / status.duration : 0;

  return (
    <View style={dc.audioCard}>
      <TouchableOpacity onPress={handlePlayPause} style={dc.audioPlayBtn}>
        <Icon name={status.playing ? 'pause' : 'play'} size={12} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={dc.audioName} numberOfLines={1}>{name}</Text>
        <View style={dc.audioProgressRow}>
          <View style={dc.audioTrack}>
            <View style={[dc.audioProgress, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={dc.audioTime}>
            {formatTime(status.currentTime)} / {formatTime(status.duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Docs Screen ─────────────────────────────────────────
export function DocsScreen() {
  const { state } = useStore();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<StartupDoc | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docTags, setDocTags] = useState<string[]>([]);
  const [docAttachments, setDocAttachments] = useState<DocAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editorMode, setEditorMode] = useState<'write' | 'preview'>('write');
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [prevContent, setPrevContent] = useState<string | null>(null); // for undo

  // Custom Tag State inside Editor
  const [newTagText, setNewTagText] = useState('');

  // Voice Memo Recorder Hooks (expo-audio SDK 56)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 1000);

  // Dynamic tags list: defaults + all saved doc tags + any tags on the doc currently being edited
  const allTags = Array.from(
    new Set([
      ...DEFAULT_TAGS,
      ...state.docs.flatMap(d => d.tags || []),
      ...docTags,
    ])
  );

  // Filtered documents
  const filteredDocs = state.docs.filter(doc => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.content.toLowerCase().includes(search.toLowerCase());
    const matchesTag = selectedTag ? doc.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const openEditor = (doc?: StartupDoc) => {
    if (doc) {
      setEditingDoc(doc);
      setDocTitle(doc.title);
      setDocContent(doc.content);
      setDocTags(doc.tags);
      setDocAttachments(doc.attachments || []);
    } else {
      setEditingDoc(null);
      setDocTitle('');
      setDocContent('');
      setDocTags(['spec']);
      setDocAttachments([]);
    }
    setNewTagText('');
    setEditorMode('write');
    setPrevContent(null);
    setEditorOpen(true);
  };

  const toggleTagSelection = (tag: string) => {
    if (docTags.includes(tag)) {
      setDocTags(docTags.filter(t => t !== tag));
    } else {
      setDocTags([...docTags, tag]);
    }
  };

  const handleAddCustomTag = () => {
    const clean = newTagText
      .trim()
      .toLowerCase()
      .replace(/#/g, '')
      .replace(/\s+/g, '-');
    if (!clean) return;

    if (!docTags.includes(clean)) {
      setDocTags([...docTags, clean]);
    }
    setNewTagText('');
  };

  // Pick general file attachments
  const handlePickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setUploadingFile(true);

      try {
        const fileExt = asset.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${state.householdId}/${fileName}`;
        const mimeType = asset.mimeType || 'application/octet-stream';

        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const fileData = new Uint8Array(arrayBuffer);

        const { error } = await supabase.storage
          .from('doc-attachments')
          .upload(filePath, fileData, {
            contentType: mimeType,
          });

        if (error) {
          Alert.alert('Upload Failed', error.message);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('doc-attachments')
          .getPublicUrl(filePath);

        const newAttachment: DocAttachment = {
          name: asset.name,
          size: fileData.byteLength,
          mimeType: mimeType,
          uri: publicUrl,
        };

        setDocAttachments([...docAttachments, newAttachment]);
      } catch (err: any) {
        Alert.alert('Upload Failed', err?.message || String(err));
      } finally {
        setUploadingFile(false);
      }
    } catch (err) {
      console.warn('Document picker error:', err);
    }
  };

  // Start Audio Recording for Voice Memo (expo-audio SDK 56)
  const handleStartRecording = async () => {
    try {
      const { status } = await getRecordingPermissionsAsync();
      let granted = status === 'granted';

      if (!granted) {
        const req = await requestRecordingPermissionsAsync();
        granted = req.granted;
      }

      if (!granted) {
        Alert.alert('Microphone Access Required', 'Please enable microphone access in settings to record voice memos.');
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.warn('Audio recording start failed:', err);
    }
  };

  // Stop Audio Recording and upload voice memo
  const handleStopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (uri) {
        setUploadingFile(true);
        try {
          const fileName = `${Date.now()}-voice-memo.m4a`;
          const filePath = `${state.householdId}/${fileName}`;

          const memoResponse = await fetch(uri);
          const memoArrayBuffer = await memoResponse.arrayBuffer();
          const memoData = new Uint8Array(memoArrayBuffer);

          const { error } = await supabase.storage
            .from('doc-attachments')
            .upload(filePath, memoData, {
              contentType: 'audio/m4a',
            });

          if (error) {
            Alert.alert('Upload Failed', error.message);
            return;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('doc-attachments')
            .getPublicUrl(filePath);

          const newAttachment: DocAttachment = {
            name: `Voice Memo (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`,
            size: 0,
            mimeType: 'audio/m4a',
            uri: publicUrl,
          };

          setDocAttachments([...docAttachments, newAttachment]);
        } catch (err) {
          Alert.alert('Upload Failed', 'Could not upload voice memo to storage. Check your connection and try again.');
        } finally {
          setUploadingFile(false);
        }
      }
    } catch (err) {
      console.warn('Audio recording stop failed:', err);
    }
  };

  const handleOpenAttachment = async (uri: string) => {
    if (uri.startsWith('file://')) {
      Alert.alert('Unavailable', 'This file was cached locally and can no longer be accessed. Re-attach the file to upload it to storage.');
      return;
    }
    try {
      await Linking.openURL(uri);
    } catch (err) {
      Alert.alert('Could Not Open', 'Unable to open this attachment. The link may be invalid.');
    }
  };

  // ─── Smart local Markdown converter ───────────────────────
  const convertToMarkdown = (raw: string): string => {
    const lines = raw.split('\n');
    const out: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) { out.push(''); continue; }

      // Horizontal rule: line of dashes/equals/stars (3+)
      if (/^[-=*]{3,}$/.test(trimmed)) { out.push('---'); continue; }

      // ALL CAPS line → heading (short = h2, longer = h3)
      if (/^[A-Z0-9\s\-&:!?/]{4,}$/.test(trimmed) && trimmed === trimmed.toUpperCase() && !/^[0-9]+[.)\s]/.test(trimmed)) {
        const level = trimmed.length <= 30 ? '## ' : '### ';
        out.push(level + trimmed.charAt(0) + trimmed.slice(1).toLowerCase());
        continue;
      }

      // Numbered list: `1. `, `1) `, `1- `
      if (/^\d+[.)\-]\s+/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)[.)\-]\s+(.*)$/)!;
        out.push(`${match[1]}. ${match[2]}`);
        continue;
      }

      // Bullet list: -, *, •, >, →
      if (/^[-*•>→]\s+/.test(trimmed)) {
        out.push('• ' + trimmed.replace(/^[-*•>→]\s+/, ''));
        continue;
      }

      // Key: value pattern → **Key**: value
      if (/^[A-Za-z][\w\s]{1,25}:\s+\S/.test(trimmed) && !trimmed.startsWith('http')) {
        const colonIdx = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        out.push(`**${key}**: ${val}`);
        continue;
      }

      // Short line following a blank line that doesn't end with punctuation → subheading
      const prevIsBlank = i > 0 && lines[i - 1].trim() === '';
      const nextIsBlank = i < lines.length - 1 && lines[i + 1].trim() === '';
      if (prevIsBlank && nextIsBlank && trimmed.length <= 50 && !/[.!?,;]$/.test(trimmed)) {
        out.push('### ' + trimmed);
        continue;
      }

      out.push(line);
    }

    // Collapse 3+ consecutive blank lines to 2
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  // ─── Groq AI enhancement (Llama via Groq cloud) ─────────────
  const enhanceWithAI = async () => {
    if (!docContent.trim()) return;
    const groqKey = process.env.EXPO_PUBLIC_GROQ_KEY;
    if (!groqKey) {
      Alert.alert(
        'Groq Key Missing',
        'Add EXPO_PUBLIC_GROQ_KEY to your .env file.\n\nGet a free key at console.groq.com — no credit card needed.',
      );
      return;
    }

    setPrevContent(docContent);
    setAiEnhancing(true);

    const systemPrompt = `You are an expert technical writer and document architect for a startup co-founder productivity app. Your job is to take raw, unstructured text and transform it into a beautifully formatted, professional markdown document.

RULES:
1. RESTRUCTURE the content — don't just add markdown symbols. Reorganise ideas into logical sections.
2. Add a clear ## Title at the top based on the content's theme.
3. Group related ideas under descriptive ### Section Headings.
4. Convert rambling sentences into tight, scannable bullet points where appropriate.
5. Use **bold** for key terms, metrics, names, and important decisions.
6. Use --- to visually separate major sections.
7. Use > blockquotes for key insights, decisions, or notable quotes.
8. Use numbered lists for steps, priorities, or sequences.
9. Fix grammar and spelling. Improve clarity. Trim filler words.
10. Preserve ALL factual content, numbers, names, and dates — never invent or omit data.
11. Return ONLY the formatted markdown. No preamble, no explanation, no code fences around the whole output.`;

    const userPrompt = `Restructure and reformat the following text into a clean, professional markdown document:\n\n${docContent}`;


    // Primary: llama-3.1-8b-instant (fastest), fallback: llama3-70b-8192
    const models = ['llama-3.1-8b-instant', 'llama3-70b-8192'];
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    const callGroq = async (model: string): Promise<string> => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 2048,
        }),
      });

      if (res.status === 429) throw new Error('RATE_LIMIT');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Groq error ${res.status}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('No content returned');
      return text;
    };

    try {
      let markdown: string | null = null;

      for (const model of models) {
        try {
          markdown = await callGroq(model);
          break;
        } catch (e: any) {
          if (e.message === 'RATE_LIMIT' && model !== models[models.length - 1]) {
            await sleep(1000);
            continue;
          }
          throw e;
        }
      }

      if (markdown) {
        setDocContent(markdown.trim());
        setEditorMode('preview');
      }
    } catch (err: any) {
      if (err?.message === 'RATE_LIMIT') {
        Alert.alert(
          'Rate Limited',
          'Groq quota hit. Wait a few seconds and try again, or use SMART FORMAT for instant offline conversion.',
        );
      } else {
        Alert.alert('AI Enhancement Failed', err?.message || 'Could not reach Groq. Try SMART FORMAT instead.');
      }
    } finally {
      setAiEnhancing(false);
    }
  };


  const handleSave = async () => {
    if (!docTitle.trim() || !docContent.trim()) {
      Alert.alert('Incomplete Spec', 'Please provide a title and content for your startup document.');
      return;
    }

    if (!state.householdId || !state.userId) return;

    setSaving(true);
    try {
      if (editingDoc) {
        // Update existing document
        const { error } = await supabase
          .from('docs')
          .update({
            title: docTitle.trim(),
            content: docContent.trim(),
            tags: docTags,
            attachments: docAttachments,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingDoc.id);

        if (error) throw error;
      } else {
        // Create new document
        const { error } = await supabase.from('docs').insert({
          household_id: state.householdId,
          title: docTitle.trim(),
          content: docContent.trim(),
          tags: docTags,
          attachments: docAttachments,
          created_by: state.userId,
        });

        if (error) throw error;
      }
      setEditorOpen(false);
    } catch (err) {
      console.warn('Docs save error:', err);
      Alert.alert('Save Failed', 'Could not sync document to Supabase. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    Alert.alert('Delete Document', 'Are you sure you want to permanently delete this startup spec?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('docs').delete().eq('id', docId);
            if (error) throw error;
            setEditorOpen(false);
          } catch (err) {
            console.warn('Delete error:', err);
          }
        },
      },
    ]);
  };

  const formatDuration = (millis: number) => {
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const remainingSecs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={dc.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 130 }}
      >
        <ScreenHeader
          eyebrow={`WIKI · ${filteredDocs.length} DOC${filteredDocs.length === 1 ? '' : 'S'}`}
          title="Specs"
          ghost="and drafts in one place."
          sub="PRDs, pitch outlines, sprint goals, and research wiki."
          right={
            <IconBtn inv onPress={() => openEditor()}>
              <Icon name="plus" size={18} color="#fff" />
            </IconBtn>
          }
        />

        {/* Search Input */}
        <View style={dc.searchContainer}>
          <Icon name="search" size={16} color={colors.fg6} />
          <TextInput
            style={dc.searchInput}
            placeholder="Search specs, ideas or metrics..."
            placeholderTextColor={colors.fg6}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Tag Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          <TouchableOpacity
            style={[dc.filterChip, !selectedTag && dc.filterChipActive]}
            onPress={() => setSelectedTag(null)}
          >
            <Text style={[dc.filterChipText, !selectedTag && dc.filterChipTextActive]}>ALL</Text>
          </TouchableOpacity>
          {allTags.map(tag => {
            const active = selectedTag === tag;
            return (
              <TouchableOpacity
                key={tag}
                style={[dc.filterChip, active && dc.filterChipActive]}
                onPress={() => setSelectedTag(active ? null : tag)}
              >
                <Text style={[dc.filterChipText, active && dc.filterChipTextActive]}>
                  #{tag.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filteredDocs.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 80 }}>
            <Icon name="note" size={40} color={colors.fg8} />
            <Text style={dc.emptyText}>No documents found. Define your next big feature.</Text>
          </View>
        ) : (
          filteredDocs.map(doc => {
            const dateStr = new Date(doc.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            const attCount = doc.attachments?.length || 0;

            return (
              <TouchableOpacity key={doc.id} style={dc.docCard} activeOpacity={1} onPress={() => openEditor(doc)}>
                <Card tight>
                  {/* Title + date row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <Text style={dc.docTitle} numberOfLines={2}>
                      {doc.title}
                    </Text>
                    <Text style={dc.docDate}>{dateStr}</Text>
                  </View>

                  {/* Attachments row — individual filename chips */}
                  {attCount > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 10 }}
                      contentContainerStyle={{ gap: 6 }}
                    >
                      {doc.attachments!.map((att, i) => (
                        <View key={i} style={dc.attChip}>
                          <Icon name="note" size={10} color={colors.fg4} />
                          <Text style={dc.attChipText} numberOfLines={1}>
                            {att.name}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  {/* Tags row */}
                  {doc.tags.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 10 }}
                      contentContainerStyle={{ gap: 6 }}
                    >
                      {doc.tags.map(t => (
                        <View key={t} style={dc.tagBadge}>
                          <Text style={dc.tagBadgeText}>#{t.toUpperCase()}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Full Page Spec Editor Modal */}
      <Modal animationType="slide" visible={editorOpen} onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={[dc.modalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={dc.modalHeader}>
            <IconBtn onPress={() => setEditorOpen(false)}>
              <Icon name="x" size={16} />
            </IconBtn>
            <Text style={dc.modalTitle}>{editingDoc ? 'Edit Spec' : 'New Spec'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {editingDoc && (
                <IconBtn onPress={() => handleDelete(editingDoc.id)}>
                  <Icon name="trash" size={14} color={colors.destructive} />
                </IconBtn>
              )}
              <TouchableOpacity style={dc.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={dc.saveBtnText}>SAVE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={{ flex: 1, padding: 18 }}>
            <Text style={dc.inputLabel}>Title</Text>
            <TextInput
              style={dc.titleInput}
              placeholder="e.g. PRD: Stripe Subscriptions"
              value={docTitle}
              onChangeText={setDocTitle}
            />

            <Text style={dc.inputLabel}>Tags (Tap to toggle)</Text>
            
            {/* Custom Tag Input */}
            <View style={dc.customTagInputRow}>
              <TextInput
                style={dc.customTagInput}
                placeholder="Add custom tag (e.g. stripe, marketing-v2)..."
                placeholderTextColor={colors.fg6}
                value={newTagText}
                onChangeText={setNewTagText}
                onSubmitEditing={handleAddCustomTag}
                returnKeyType="done"
              />
              <TouchableOpacity style={dc.customTagAddBtn} onPress={handleAddCustomTag}>
                <Icon name="plus" size={14} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* List of active/selected tags & popular ones */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {Array.from(new Set([...docTags, ...allTags])).map(tag => {
                const selected = docTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[dc.editorTagChip, selected && dc.editorTagChipActive]}
                    onPress={() => toggleTagSelection(tag)}
                  >
                    <Text style={[dc.editorTagText, selected && dc.editorTagTextActive]}>
                      #{tag.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Divider />

            {/* Attachments Section */}
            <Text style={dc.inputLabel}>Attachments ({docAttachments.length})</Text>
            <View style={dc.attSection}>
              {docAttachments.map((att, idx) => {
                const isAudio = att.mimeType.startsWith('audio/') || att.name.includes('Voice Memo');

                if (isAudio) {
                  return (
                    <View key={idx} style={{ position: 'relative' }}>
                      <AudioPlayerCard uri={att.uri} name={att.name} />
                      <TouchableOpacity
                        style={dc.audioRemoveBtn}
                        onPress={() => setDocAttachments(docAttachments.filter((_, i) => i !== idx))}
                      >
                        <Icon name="x" size={10} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  );
                }

                return (
                  <View key={idx} style={dc.attRow}>
                    <Icon name="note" size={13} color={colors.foreground} />
                    <Text style={dc.attName} numberOfLines={1}>
                      {att.name}
                    </Text>
                    <Text style={dc.attSize}>
                      ({att.size > 1024 * 1024 ? `${(att.size / (1024 * 1024)).toFixed(1)} MB` : `${(att.size / 1024).toFixed(0)} KB`})
                    </Text>

                    {/* Open Button */}
                    <TouchableOpacity style={dc.attActionBtn} onPress={() => handleOpenAttachment(att.uri)}>
                      <Icon name="arrow" size={11} color={colors.fg2} />
                    </TouchableOpacity>

                    {/* Remove Button */}
                    <TouchableOpacity
                      style={dc.attActionBtn}
                      onPress={() => setDocAttachments(docAttachments.filter((_, i) => i !== idx))}
                    >
                      <Icon name="x" size={11} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {recorderState.isRecording ? (
                <View style={dc.recordingHud}>
                  <View style={dc.recRow}>
                    <View style={dc.recIndicatorPulse} />
                    <Text style={dc.recText}>RECORDING MEMO · {formatDuration(recorderState.durationMillis)}</Text>
                  </View>
                  <TouchableOpacity style={dc.recStopBtn} onPress={handleStopRecording}>
                    <Icon name="reset" size={12} color="#fff" />
                    <Text style={dc.recStopBtnText}>STOP & SAVE</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[dc.attAddBtn, { flex: 1 }]} onPress={handlePickAttachment} disabled={uploadingFile}>
                    {uploadingFile ? (
                      <ActivityIndicator size="small" color={colors.foreground} />
                    ) : (
                      <>
                        <Icon name="plus" size={12} color={colors.foreground} />
                        <Text style={dc.attAddBtnText}>ATTACH FILE</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={[dc.attAddBtn, { flex: 1 }]} onPress={handleStartRecording} disabled={uploadingFile}>
                    <Icon name="bolt" size={12} color={colors.foreground} />
                    <Text style={dc.attAddBtnText}>🎙️ RECORD MEMO</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Divider />

            {/* Content Editor with live markdown preview */}
            <View style={dc.editorHeader}>
              <Text style={dc.inputLabel}>Content / Specification Draft</Text>
              <View style={dc.modeTabs}>
                <TouchableOpacity
                  style={[dc.modeTab, editorMode === 'write' && dc.modeTabActive]}
                  onPress={() => setEditorMode('write')}
                >
                  <Text style={[dc.modeTabText, editorMode === 'write' && dc.modeTabTextActive]}>WRITE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[dc.modeTab, editorMode === 'preview' && dc.modeTabActive]}
                  onPress={() => setEditorMode('preview')}
                >
                  <Text style={[dc.modeTabText, editorMode === 'preview' && dc.modeTabTextActive]}>PREVIEW</Text>
                </TouchableOpacity>
              </View>
            </View>

            {editorMode === 'write' ? (
              <>
                {/* Format toolbar */}
                <View style={dc.formatBar}>
                  <Text style={dc.formatBarLabel}>FORMAT</Text>
                  <View style={dc.formatBarBtns}>
                    <TouchableOpacity
                      style={dc.formatBtn}
                      onPress={() => {
                        if (!docContent.trim()) return;
                        setPrevContent(docContent);
                        setDocContent(convertToMarkdown(docContent));
                        setEditorMode('preview');
                      }}
                    >
                      <Icon name="bolt" size={11} color={colors.foreground} />
                      <Text style={dc.formatBtnText}>SMART FORMAT</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[dc.formatBtn, dc.formatBtnAI, aiEnhancing && { opacity: 0.6 }]}
                      onPress={enhanceWithAI}
                      disabled={aiEnhancing}
                    >
                      {aiEnhancing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Icon name="bolt" size={11} color="#fff" />
                      )}
                      <Text style={[dc.formatBtnText, { color: '#fff' }]}>
                        {aiEnhancing ? 'ENHANCING...' : 'ENHANCE WITH AI'}
                      </Text>
                    </TouchableOpacity>

                    {prevContent !== null && (
                      <TouchableOpacity
                        style={dc.formatBtnUndo}
                        onPress={() => { setDocContent(prevContent!); setPrevContent(null); }}
                      >
                        <Icon name="reset" size={11} color={colors.fg2} />
                        <Text style={[dc.formatBtnText, { color: colors.fg2 }]}>UNDO</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TextInput
                  style={dc.contentInput}
                  placeholder={`Paste or type content here.\nUse SMART FORMAT to auto-detect structure.\nSupports **bold**, *italic*, \`code\`, # Heading...`}
                  placeholderTextColor={colors.fg6}
                  multiline
                  textAlignVertical="top"
                  value={docContent}
                  onChangeText={setDocContent}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </>
            ) : (
              <View style={dc.previewContainer}>
                {docContent.trim() ? (
                  parseMarkdown(docContent, { fontSize: 14.5, lineHeight: 22, color: colors.foreground })
                ) : (
                  <Text style={dc.previewEmpty}>Nothing to preview yet. Switch to WRITE and start typing.</Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const dc = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.foreground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    ...shadows.sm,
  },
  newBtnText: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border10,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.foreground,
    marginLeft: 8,
  },
  tagScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  filterChipText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: colors.foreground,
  },
  filterChipTextActive: {
    color: '#fff',
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
  docCard: {
    marginVertical: 6,
  },
  docTitle: {
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: -0.2,
    color: colors.foreground,
    flex: 1,
  },
  docDate: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: colors.fg6,
  },
  docExcerpt: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '300',
    color: colors.fg3,
    marginTop: 6,
  },
  docTagText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: colors.fg5,
  },
  tagBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border10,
  },
  tagBadgeText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.fg4,
    letterSpacing: 0.5,
  },
  attChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border08,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 180,
  },
  attChipText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '600',
    color: colors.fg4,
    flexShrink: 1,
  },
  cardAttBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgTint02,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  cardAttBadgeText: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '600',
    color: colors.fg5,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border06,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgTint04,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.foreground,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220,38,38,0.06)',
    marginRight: 6,
  },
  saveBtn: {
    backgroundColor: colors.foreground,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    ...shadows.sm,
  },
  saveBtnText: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  inputLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.fg6,
    marginBottom: 8,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.foreground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border12,
    paddingBottom: 6,
    marginBottom: 16,
  },
  // Custom Tag Input styling
  customTagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  customTagInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border10,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: colors.foreground,
  },
  customTagAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorTagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border08,
  },
  editorTagChipActive: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  editorTagText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: colors.foreground,
  },
  editorTagTextActive: {
    color: '#fff',
  },
  attSection: {
    marginBottom: 16,
    gap: 6,
  },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border06,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 6,
  },
  attName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  attSize: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: colors.fg6,
  },
  attActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  attAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border20,
    borderRadius: 10,
    height: 40,
    backgroundColor: colors.bgTint02,
  },
  attAddBtnText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.foreground,
  },
  // Voice Memo / Audio player styling
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.foreground,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    ...shadows.sm,
  },
  audioPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  audioProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioProgress: {
    height: '100%',
    backgroundColor: '#fff',
  },
  audioTime: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: 'rgba(255,255,255,0.6)',
  },
  audioRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.border12,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
    zIndex: 10,
  },
  // Recording HUD styling
  recordingHud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.destructive,
    borderRadius: 10,
    padding: 10,
    height: 46,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recIndicatorPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  recText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  recStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 28,
    gap: 4,
  },
  recStopBtnText: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
  },
  contentInput: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.foreground,
    minHeight: 300,
    paddingBottom: 40,
    fontFamily: 'Courier',
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.bgTint04,
    borderRadius: radius.md,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border08,
  },
  modeTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.md - 2,
  },
  modeTabActive: {
    backgroundColor: colors.foreground,
  },
  modeTabText: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    color: colors.fg4,
    letterSpacing: 0.5,
  },
  modeTabTextActive: {
    color: '#fff',
  },
  previewContainer: {
    minHeight: 300,
    paddingBottom: 40,
    paddingTop: 4,
  },
  previewEmpty: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.fg6,
    fontStyle: 'italic',
  },
  formatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border08,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
    gap: 8,
  },
  formatBarLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.fg6,
    letterSpacing: 1,
  },
  formatBarBtns: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
  },
  formatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: colors.bgTint04,
    borderWidth: 1,
    borderColor: colors.border10,
  },
  formatBtnAI: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  formatBtnUndo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    backgroundColor: colors.bgTint02,
    borderWidth: 1,
    borderColor: colors.border08,
  },
  formatBtnText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: colors.foreground,
    letterSpacing: 0.5,
  },
});
