<!-- 个人中心页面 -->
<template>
  <div class="w-full h-full p-0 bg-transparent border-none shadow-none">
    <div class="relative flex-b mt-2.5 max-md:block max-md:mt-1">
      <div class="w-112 mr-5 max-md:w-full max-md:mr-0">
        <div class="art-card-sm relative p-9 pb-6 overflow-hidden text-center">
          <img class="absolute top-0 left-0 w-full h-50 object-cover" src="@imgs/user/bg.webp" />
          <img class="relative z-10 w-20 h-20 mt-30 mx-auto object-cover border-2 border-white rounded-full" src="@imgs/user/avatar.webp" />
          <h2 class="mt-5 text-xl font-normal">{{ userInfo.userName }}</h2>
          <p class="mt-2 text-sm text-gray-400">{{ userInfo.email || '未设置邮箱' }}</p>
          <div class="mt-4">
            <el-tag v-for="role in userInfo.roles || []" :key="role" size="small" class="mx-1">{{ role }}</el-tag>
          </div>
        </div>
      </div>
      <div class="flex-1 overflow-hidden max-md:w-full max-md:mt-3.5">
        <div class="art-card-sm my-5">
          <h1 class="p-4 text-xl font-normal border-b border-g-300">更改密码</h1>
          <ElForm ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" class="box-border p-5" label-width="86px" label-position="top">
            <ElFormItem label="当前密码" prop="oldPassword">
              <ElInput v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
            </ElFormItem>
            <ElFormItem label="新密码" prop="newPassword">
              <ElInput v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码（至少6位）" />
            </ElFormItem>
            <ElFormItem label="确认新密码" prop="confirmPassword">
              <ElInput v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
            </ElFormItem>
            <div class="flex-c justify-end">
              <ElButton type="primary" :loading="pwdLoading" v-ripple @click="submitPassword">修改密码</ElButton>
            </div>
          </ElForm>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useUserStore } from '@/store/modules/user'
import axios from 'axios'

defineOptions({ name: 'UserCenter' })

const userStore = useUserStore()
const userInfo = computed(() => userStore.getUserInfo)

const pwdFormRef = ref<FormInstance>()
const pwdLoading = ref(false)

const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const pwdRules = reactive<FormRules>({
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== pwdForm.newPassword) callback(new Error('两次密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ]
})

async function submitPassword() {
  if (!pwdFormRef.value) return
  const valid = await pwdFormRef.value.validate().catch(() => false)
  if (!valid) return

  pwdLoading.value = true
  try {
    const res = await axios.post('/api/user/change-password', {
      userId: userInfo.value.userId,
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword
    })
    if (res.data?.code === 200) {
      ElMessage.success('密码修改成功，请重新登录')
      pwdForm.oldPassword = ''
      pwdForm.newPassword = ''
      pwdForm.confirmPassword = ''
      // 延迟登出
      setTimeout(() => userStore.logOut(), 1500)
    } else {
      ElMessage.error(res.data?.msg || '密码修改失败')
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '请求失败')
  } finally {
    pwdLoading.value = false
  }
}
</script>
