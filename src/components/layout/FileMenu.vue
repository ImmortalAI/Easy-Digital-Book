<script setup lang="ts">
import { computed } from "vue";
import { IconChevronDown, IconPointFilled } from "@tabler/icons-vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

defineProps<{ title: string; dirty: boolean }>();
const emit = defineEmits<{ new: []; open: []; save: []; saveAs: []; close: [] }>();
const { t } = useSafeI18n();

type Command = "new" | "open" | "save" | "saveAs" | "close";

// Computed so the labels follow a live locale switch from Settings. Groups are
// separated in the menu: create/open, save, close.
const groups = computed<Array<Array<{ command: Command; label: string; shortcut: string }>>>(() => [
  [
    { command: "new", label: t("welcome.newProject", "New project"), shortcut: "Mod+N" },
    { command: "open", label: t("fileMenu.open", "Open…"), shortcut: "Mod+O" },
  ],
  [
    { command: "save", label: t("common.save", "Save"), shortcut: "Mod+S" },
    { command: "saveAs", label: t("fileMenu.saveAs", "Save as…"), shortcut: "Mod+Shift+S" },
  ],
  [{ command: "close", label: t("fileMenu.close", "Close project"), shortcut: "Mod+W" }],
]);

function run(command: Command) {
  // A union-typed emit needs each event named literally.
  if (command === "new") emit("new");
  else if (command === "open") emit("open");
  else if (command === "save") emit("save");
  else if (command === "saveAs") emit("saveAs");
  else emit("close");
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="-ml-2 min-w-0 gap-1 font-normal">
        <span class="truncate">{{ title }}</span>
        <IconPointFilled
          v-if="dirty"
          role="img"
          :aria-label="t('editor.unsaved', 'Unsaved changes')"
          class="size-3 shrink-0"
        />
        <IconChevronDown class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="min-w-56">
      <template v-for="(group, index) in groups" :key="index">
        <DropdownMenuSeparator v-if="index > 0" />
        <DropdownMenuItem v-for="item in group" :key="item.command" @select="run(item.command)">
          {{ item.label }}
          <DropdownMenuShortcut>{{ item.shortcut }}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
