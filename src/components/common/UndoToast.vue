<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { IconX } from "@tabler/icons-vue";
import type { Notification } from "@/stores/notifications";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { Button } from "@/components/ui/button";
import {
  injectToastProviderContext,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
} from "@/components/ui/toast";

const props = defineProps<{
  notification: Notification;
  /** Pushed out of the stack by newer toasts: close it. */
  superseded?: boolean;
}>();
const emit = defineEmits<{ close: []; undo: [] }>();
const { t } = useSafeI18n();
const provider = injectToastProviderContext();

const open = ref(!props.superseded);
// The primitive owns the timer and pauses it for the whole viewport (hover,
// focus inside, window blur). A toast born into a paused viewport starts
// paused; later changes arrive as pause / resume.
const paused = ref(provider.isClosePausedRef.value);

watch(
  () => props.superseded,
  (superseded) => {
    if (superseded) open.value = false;
  },
);
// Superseded before it ever showed: there is no exit to wait for.
onMounted(() => {
  if (!open.value) emit("close");
});

// Reka listens for Escape on the whole window, and every other layer (dialogs,
// menus) shares that keydown, so the event itself must stay untouched: a
// preventDefault here would stop the dialog from closing. Instead the toast's
// `open` is controlled, and a close that Escape caused outside the
// notifications is ignored. Reka closes synchronously right after emitting
// escapeKeyDown, so the flag never outlives the keystroke.
let escapedOutside = false;
function noteEscape(event: KeyboardEvent) {
  const target = event.target instanceof Node ? event.target : null;
  escapedOutside = !provider.viewport.value?.contains(target);
}
function updateOpen(value: boolean) {
  const ignore = !value && escapedOutside;
  escapedOutside = false;
  if (!ignore) open.value = value;
}
</script>

<template>
  <Toast
    :open="open"
    :duration="notification.duration ?? 8000"
    :variant="notification.kind === 'error' ? 'destructive' : 'default'"
    :data-kind="notification.kind"
    class="undo-toast flex items-center gap-2 pr-2"
    @pause="paused = true"
    @resume="paused = false"
    @update:open="updateOpen"
    @escape-key-down="noteEscape"
  >
    <ToastDescription class="min-w-0 flex-1">{{ notification.message }}</ToastDescription>
    <ToastAction v-if="notification.undo" as-child :alt-text="t('common.undo', 'Undo')">
      <Button
        size="xs"
        variant="outline"
        :disabled="!notification.undoEnabled"
        @click="emit('undo')"
      >
        {{ t("common.undo", "Undo") }}
      </Button>
    </ToastAction>
    <ToastClose as-child>
      <Button size="icon-xs" variant="ghost" :aria-label="t('common.close', 'Close')">
        <IconX aria-hidden="true" />
      </Button>
    </ToastClose>
    <!-- Only the bar is clipped to the toast's rounded corners; the dot's glow
         spills past the bottom edge, so the toast itself must not clip. -->
    <span class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <!-- Presence unmounts the toast's content once the exit animation has
           played; that is when the notification leaves the store. -->
      <span
        data-testid="undo-progress"
        class="undo-progress"
        :data-paused="paused || undefined"
        :style="{ animationDuration: `${notification.duration ?? 8000}ms` }"
        @vue:unmounted="emit('close')"
      />
    </span>
    <span
      aria-hidden="true"
      class="undo-progress-dot"
      :data-paused="paused || undefined"
      :style="{ animationDuration: `${notification.duration ?? 8000}ms` }"
    />
  </Toast>
</template>

<style scoped>
/* The toast element is teleported by the primitive and does not carry this
   component's scope attribute, hence :global for the root rules. */
:global(.undo-toast[data-state="open"]) {
  animation: toast-enter 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
:global(.undo-toast[data-state="closed"]) {
  animation: toast-exit 160ms cubic-bezier(0.36, 0, 0.66, -0.56) forwards;
}
/* The bar and its dot follow the toast's kind: an error counts down in red. */
:global(.undo-toast) {
  --undo-accent: var(--primary);
}
:global(.undo-toast[data-kind="error"]) {
  --undo-accent: var(--destructive);
}
.undo-progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  transform-origin: left;
  background: var(--undo-accent);
  animation: undo-progress linear forwards;
}
/* Rides the end of the bar, fading and shrinking as time runs out. */
.undo-progress-dot {
  position: absolute;
  bottom: 1px;
  left: 100%;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--undo-accent);
  box-shadow: 0 0 0.5rem 0.125rem var(--undo-accent);
  transform: translate(-50%, 50%);
  animation: undo-progress-dot linear forwards;
}
.undo-progress[data-paused],
.undo-progress-dot[data-paused] {
  animation-play-state: paused;
}
@keyframes undo-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
@keyframes undo-progress-dot {
  from {
    left: 100%;
    opacity: 1;
    transform: translate(-50%, 50%) scale(1);
  }
  to {
    left: 0;
    opacity: 0;
    transform: translate(-50%, 50%) scale(0.25);
  }
}
@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(0.5rem) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes toast-exit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(0.5rem) scale(0.96);
  }
}
@media (prefers-reduced-motion: reduce) {
  :global(.undo-toast[data-state="open"]) {
    animation: fade-toast-in 160ms ease-out;
  }
  :global(.undo-toast[data-state="closed"]) {
    animation: fade-toast-out 160ms ease-in forwards;
  }
}
@keyframes fade-toast-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes fade-toast-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
