<script setup lang="ts">
import Breadcrumbs from "@/components/layout/Breadcrumbs.vue";
</script>

<template>
  <!-- A size container: the toolbar inside hides buttons by this row's width,
       not the window's, because the sidebar takes part of the window. -->
  <div
    class="@container flex min-h-9 shrink-0 items-center gap-2 border-b pr-2"
    data-content-header
  >
    <Breadcrumbs class="min-w-0 flex-1" />
    <slot />
  </div>
</template>
