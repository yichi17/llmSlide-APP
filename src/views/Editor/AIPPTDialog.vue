<template>
  <div class="aippt-dialog">
    <div class="header">
      <span class="title">llmSlide</span>
      <span class="subtite" v-if="step === 'template'">選擇模板</span>
      <span class="subtite" v-else-if="step === 'outline'">請確認是否有內容</span>
      <span class="subtite" v-else>選擇文件</span>
    </div>
    
    <template v-if="step === 'setup'">
      <div class="file-selector">
        <Button @click="handleFileSelect">
          選擇文件
        </Button>
        <input 
          type="primary" 
          @change="handleFileSelect"
          style="display: none;"
        />
        <span v-if="selectedFile" class="file-name">{{ selectedFile.name }}</span>
        <Button 
        class="submit-btn" 
        type="primary" 
        @click="createOutline()"
        :disabled="!selectedFile"
        >
          繼續
        </Button>
      </div>
    </template>

    <div class="preview" v-if="step === 'outline'">
      <pre ref="outlineRef" v-if="outlineCreating">{{ outline }}</pre>
       <div class="outline-view" v-else>
         <OutlineEditor v-model:value="outline" />
       </div>
      <div class="btns" v-if="!outlineCreating">
        <Button class="btn" type="primary" @click="step = 'template'">選擇模板</Button>
        <Button class="btn" @click="outline = ''; step = 'setup'">重新選擇檔案</Button>
      </div>
    </div>

    <div class="select-template" v-if="step === 'template'">
      <div class="templates">
        <div class="template" 
          :class="{ 'selected': selectedTemplate === template.id }" 
          v-for="template in templates" 
          :key="template.id" 
          @click="selectedTemplate = template.id"
        >
          <!--template.cover 已被移除 原先為照片網址-->
          <span class="template-name">{{ template.name }}</span>
        </div>
      </div>
      <div class="btns">
        <Button class="btn" type="primary" @click="createPPT()">
          <IconSend class="icon" />
          生成
        </Button>
        <Button class="btn" @click="step = 'outline'">上一步</Button>
      </div>
    </div>

    <FullscreenSpin :loading="loading" tip="讀取中 ..." />
    <FullscreenSpin :loading="generating" tip="生成中 ..." />
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import api from '@/services'
import useAIPPT from '@/hooks/useAIPPT'
import type { AIPPTSlide } from '@/types/AIPPT'
import type { Slide } from '@/types/slides'
import message from '@/utils/message'
import { useMainStore, useSlidesStore } from '@/store'
import Input from '@/components/Input.vue'
import Button from '@/components/Button.vue'
import Select from '@/components/Select.vue'
import FullscreenSpin from '@/components/FullscreenSpin.vue'
import OutlineEditor from '@/components/OutlineEditor.vue'

const mainStore = useMainStore()
const { templates } = storeToRefs(useSlidesStore())
const { AIPPT, getMdContent } = useAIPPT()

const language = ref<'zh_tw' | 'en'>('zh_tw')
const keyword = ref('')
const outline = ref('')
const selectedTemplate = ref('template_1')
const loading = ref(false)
const generating = ref(false)
const outlineCreating = ref(false)
const outlineRef = ref<HTMLElement>()
const inputRef = ref<InstanceType<typeof Input>>()
const step = ref<'setup' | 'outline' | 'template'>('setup')
const selectedFile = ref<{ name: string; path: string } | null>(null)


onMounted(() => {
})

const handleFileSelect = async () => {
  try {
    const result = await window.electronAPI.selectFile()
    if (!result) return
    const name = result.split(/[/\\\\]/).pop() || 'unknown'
    selectedFile.value = {
        name: name,
        path: result
      }
  } catch (err) {
    console.error('Error selecting file:', err)
  }
}

const createOutline = async () => {
  if (!selectedFile.value?.path) return
  step.value = 'outline'
  outlineCreating.value = true
  loading.value = true
  await window.electronAPI.ocrPDF(selectedFile.value.path).then((text: string) => {
    outline.value = text
    loading.value = false
    outlineCreating.value = false
  }).catch((err: any) => {
    console.error('Error during OCR:', err)
    outline.value = 'Error extracting text from PDF. Please try again with a different file.'
    loading.value = false
  })
}

const createPPT = async () => {
  generating.value = true
  const templateSlides: Slide[] = await api.getMockData(selectedTemplate.value).then(ret => ret.slides)
  const result = await window.electronAPI.generateSlides(outline.value, language.value)
  const resultJson = JSON.parse(result)

  console.log('LLM Return:', resultJson)
  console.log(resultJson.length)

  for (const item of resultJson) {
    try {
      const slide: AIPPTSlide = item
      AIPPT(templateSlides, [slide])
    } catch (err) {
      console.error('Error parsing slide JSON:', err)
    }
  }


  generating.value = false
  mainStore.setAIPPTDialogState(false)

}
</script>

<style lang="scss" scoped>
.aippt-dialog {
  margin: -20px;
  padding: 30px;
}
.header {
  margin-bottom: 12px;

  .title {
    font-weight: 700;
    font-size: 20px;
    margin-right: 8px;
    background: linear-gradient(270deg, #d897fd, #33bcfc);
    background-clip: text;
    color: transparent;
    vertical-align: text-bottom;
    line-height: 1.1;
  }
  .subtite {
    color: #888;
    font-size: 12px;
  }
}
.preview {
  pre {
    max-height: 450px;
    padding: 10px;
    margin-bottom: 15px;
    background-color: #f1f1f1;
    overflow: auto;
  }
  .outline-view {
    max-height: 450px;
    padding: 10px;
    margin-bottom: 15px;
    background-color: #f1f1f1;
    overflow: auto;
  }
  .btns {
    display: flex;
    justify-content: center;
    align-items: center;

    .btn {
      width: 120px;
      margin: 0 5px;
    }
  }
}
.select-template {
  .templates {
    display: flex;
    margin-bottom: 10px;
    @include flex-grid-layout();
  
    .template {
      border: 2px solid $borderColor;
      border-radius: $borderRadius;
      width: 304px;
      height: 172.75px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      &:not(:nth-child(2n)) {
        margin-right: 12px;
      }

      &.selected {
        border-color: $themeColor;
      }

      .template-name {
        display: block;
        text-align: center;
        margin-top: 8px;
        font-size: 14px;
        color: $themeColor;
      }
  
      img {
        width: 100%;
      }
    }
  }
  .btns {
    display: flex;
    justify-content: center;
    align-items: center;

    .btn {
      width: 120px;
      margin: 0 5px;
    }
  }
}
.configs {
  margin-top: 5px;
  display: flex;
  justify-content: space-between;

  .items {
    display: flex;
  }
  .item {
    margin-right: 5px;
  }
}
.recommends {
  display: flex;
  flex-wrap: wrap;
  margin-top: 10px;

  .recommend {
    font-size: 12px;
    background-color: #f1f1f1;
    border-radius: $borderRadius;
    padding: 3px 5px;
    margin-right: 5px;
    margin-top: 5px;
    cursor: pointer;

    &:hover {
      color: $themeColor;
    }
  }
}
.model-selector {
  margin-top: 10px;
  font-size: 13px;
  display: flex;
  align-items: center;
}
.count {
  font-size: 12px;
  color: #999;
  margin-right: 10px;
}
.language {
  font-size: 12px;
  margin-right: 10px;
  color: $themeColor;
  cursor: pointer;
}
.submit {
  height: 20px;
  font-size: 12px;
  background-color: $themeColor;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 5px;
  border-radius: $borderRadius;
  cursor: pointer;

  &:hover {
    background-color: $themeHoverColor;
  }

  .icon {
    font-size: 15px;
    margin-right: 3px;
  }
}
.file-selector {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 20px;
}
.file-name {
  margin-top: 5px;
  font-size: 14px;
  color: $themeColor;
  display: block;
  text-align: center;
}
</style>
