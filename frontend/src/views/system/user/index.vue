<template>
  <div class="user-page art-full-height">
    <UserSearch v-model="searchForm" @search="handleSearch" @reset="resetSearchParams" />
    <ElCard class="art-table-card">
      <ArtTableHeader v-model:columns="columnChecks" :loading="loading" @refresh="refreshData">
        <template #left><ElButton @click="showDialog('add')" v-ripple>新增用户</ElButton></template>
      </ArtTableHeader>
      <ArtTable :loading="loading" :data="data" :columns="columns" :pagination="pagination"
        @selection-change="handleSelectionChange" @pagination:size-change="handleSizeChange" @pagination:current-change="handleCurrentChange" />
      <UserDialog v-model:visible="dialogVisible" :type="dialogType" :user-data="currentUserData" @submit="handleDialogSubmit" />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
import { ref, h, nextTick } from 'vue'
import { ElTag, ElMessage, ElMessageBox, ElButton } from 'element-plus'
import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
import { useTable } from '@/hooks/core/useTable'
import { fetchGetUserList } from '@/api/system-manage'
import UserSearch from './modules/user-search.vue'
import UserDialog from './modules/user-dialog.vue'
import axios from 'axios'

defineOptions({ name: 'User' })
type UserListItem = Api.SystemManage.UserListItem

const dialogType = ref<any>('add')
const dialogVisible = ref(false)
const currentUserData = ref<Partial<UserListItem>>({})
const selectedRows = ref<UserListItem[]>([])
const searchForm = ref({ userName: undefined, status: '1' })

const { columns, columnChecks, data, loading, pagination, getData, replaceSearchParams, resetSearchParams, handleSizeChange, handleCurrentChange, refreshData } = useTable({
  core: {
    apiFn: fetchGetUserList,
    apiParams: { current: 1, size: 20, ...searchForm.value },
    columnsFactory: () => [
      { type: 'selection' },
      { type: 'index', width: 60, label: '序号' },
      { prop: 'userName', label: '用户名', width: 150 },
      { prop: 'nickName', label: '昵称', width: 120 },
      { prop: 'userEmail', label: '邮箱' },
      { prop: 'userPhone', label: '手机号', width: 130 },
      {
        prop: 'userRoles', label: '角色', width: 180,
        formatter: (row) => h('div', (row.userRoles || []).map((r: string) => h(ElTag, { size: 'small', class: 'mr-1', key: r }, () => r)))
      },
      {
        prop: 'status', label: '状态', width: 80,
        formatter: (row) => h(ElTag, { type: row.status === '1' ? 'success' : 'danger', size: 'small' }, () => row.status === '1' ? '正常' : '禁用')
      },
      { prop: 'createTime', label: '创建时间', width: 170, sortable: true },
      {
        prop: 'operation', label: '操作', width: 200, fixed: 'right',
        formatter: (row) => h('div', [
          h(ArtButtonTable, { type: 'edit', onClick: () => showDialog('edit', row) }),
          h(ArtButtonTable, { type: 'delete', onClick: () => deleteUser(row) }),
          h(ElButton, { size: 'small', type: 'warning', text: true, onClick: () => resetPwd(row) }, () => '重置密码')
        ])
      }
    ]
  }
})

function handleSearch(params: any) { replaceSearchParams(params); getData() }

function showDialog(type: any, row?: UserListItem) {
  dialogType.value = type
  currentUserData.value = row || {}
  nextTick(() => { dialogVisible.value = true })
}

function handleDialogSubmit() { dialogVisible.value = false; getData() }

function deleteUser(row: UserListItem) {
  ElMessageBox.confirm(`确定删除用户「${row.userName}」？`, '确认删除', { type: 'warning' }).then(async () => {
    try {
      const res = await axios.delete('/api/user/delete', { data: { id: row.id } })
      if (res.data?.code === 200) { ElMessage.success('删除成功'); getData() }
      else ElMessage.error(res.data?.msg || '删除失败')
    } catch (e: any) { ElMessage.error(e.response?.data?.msg || '请求失败') }
  }).catch(() => {})
}

function resetPwd(row: UserListItem) {
  ElMessageBox.confirm(`确定重置「${row.userName}」的密码为 123456？`, '重置密码', { type: 'warning' }).then(async () => {
    try {
      const res = await axios.post('/api/user/reset-password', { userId: row.id })
      if (res.data?.code === 200) ElMessage.success('密码已重置为 123456')
      else ElMessage.error(res.data?.msg || '重置失败')
    } catch (e: any) { ElMessage.error(e.response?.data?.msg || '请求失败') }
  }).catch(() => {})
}

function handleSelectionChange(selection: UserListItem[]) { selectedRows.value = selection }
</script>
