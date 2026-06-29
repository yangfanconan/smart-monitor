<template>
  <div class="exception-page">
    <el-result icon="error" title="500" sub-title="抱歉，服务器出错了">
      <template #extra><el-button type="primary" @click="$router.push('/')">返回首页</el-button></template>
    </el-result>
  </div>
</template>
<style scoped>.exception-page { display: flex; justify-content: center; align-items: center; min-height: 80vh; }</style>
