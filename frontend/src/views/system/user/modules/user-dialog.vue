<template>
  <ElDialog v-model="dialogVisible" :title="dialogType === 'add' ? '添加用户' : '编辑用户'" width="460px" align-center>
    <ElForm ref="formRef" :model="formData" :rules="rules" label-width="80px">
      <ElFormItem label="用户名" prop="username">
        <ElInput v-model="formData.username" placeholder="请输入用户名" :disabled="dialogType === 'edit'" />
      </ElFormItem>
      <ElFormItem v-if="dialogType === 'add'" label="密码" prop="password">
        <ElInput v-model="formData.password" type="password" show-password placeholder="请输入初始密码" />
      </ElFormItem>
      <ElFormItem label="昵称" prop="nickName">
        <ElInput v-model="formData.nickName" placeholder="请输入昵称" />
      </ElFormItem>
      <ElFormItem label="邮箱" prop="email">
        <ElInput v-model="formData.email" placeholder="请输入邮箱" />
      </ElFormItem>
      <ElFormItem label="手机号" prop="phone">
        <ElInput v-model="formData.phone" placeholder="请输入手机号" />
      </ElFormItem>
      <ElFormItem label="角色" prop="roles">
        <ElSelect v-model="formData.roles" multiple placeholder="请选择角色">
          <ElOption v-for="r in roles" :key="r.roleCode" :value="r.roleCode" :label="r.roleName" />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="dialogVisible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="handleSubmit">提交</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import axios from 'axios'

interface Props { visible: boolean; type: string; userData?: any }
interface Emits { (e: 'update:visible', v: boolean): void; (e: 'submit'): void }

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const roles = ref<any[]>([])

const dialogVisible = computed({ get: () => props.visible, set: (v) => emit('update:visible', v) })
const dialogType = computed(() => props.type)

const formData = reactive({ username: '', password: '', nickName: '', email: '', phone: '', roles: [] as string[] })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 6, message: '至少6位', trigger: 'blur' }],
  roles: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

async function fetchRoles() {
  try {
    const res = await axios.get('/api/role/list', { params: { current: 1, size: 100 } })
    roles.value = res.data?.data?.records || []
  } catch {}
}

function initForm() {
  if (props.type === 'edit' && props.userData) {
    const r = props.userData
    Object.assign(formData, { username: r.userName || '', password: '', nickName: r.nickName || '', email: r.userEmail || '', phone: r.userPhone || '', roles: r.userRoles || [] })
  } else {
    Object.assign(formData, { username: '', password: '', nickName: '', email: '', phone: '', roles: [] })
  }
}

watch(() => props.visible, (v) => {
  if (v) { initForm(); fetchRoles(); nextTick(() => formRef.value?.clearValidate()) }
}, { immediate: true })

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (dialogType.value === 'add') {
      const res = await axios.post('/api/user/create', {
        username: formData.username, password: formData.password,
        nickName: formData.nickName, userEmail: formData.email,
        userPhone: formData.phone, userRoles: formData.roles
      })
      if (res.data?.code === 200) { ElMessage.success('创建成功'); dialogVisible.value = false; emit('submit') }
      else ElMessage.error(res.data?.msg || '创建失败')
    } else {
      const res = await axios.put('/api/user/update', {
        id: props.userData.id, nickName: formData.nickName,
        userEmail: formData.email, userPhone: formData.phone,
        userRoles: formData.roles, status: props.userData.status || '1'
      })
      if (res.data?.code === 200) { ElMessage.success('更新成功'); dialogVisible.value = false; emit('submit') }
      else ElMessage.error(res.data?.msg || '更新失败')
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '请求失败')
  } finally { submitting.value = false }
}
</script>
