<template>
  <div class="exception-page">
    <el-result icon="warning" title="404" sub-title="抱歉，您访问的页面不存在">
      <template #extra><el-button type="primary" @click="$router.push('/')">返回首页</el-button></template>
    </el-result>
  </div>
</template>
<style scoped>.exception-page { display: flex; justify-content: center; align-items: center; min-height: 80vh; }</style>
