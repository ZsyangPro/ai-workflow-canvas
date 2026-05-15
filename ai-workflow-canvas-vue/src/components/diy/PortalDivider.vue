<script setup lang="ts">
defineProps<{ config: Record<string, any> }>()
</script>

<template>
  <div :style="{ height: (config.height || 48) + 'px' }" />
</template>
