import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined
} from '@ant-design/icons';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useLanguage } from '../i18n';
import type { CredentialTemplate } from '../../shared/types';

export const CredentialTemplates: React.FC = () => {
  const { api } = useElectronAPI();
  const { t } = useLanguage();
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState<CredentialTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CredentialTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [api]);

  const loadTemplates = async () => {
    if (!api) return;

    setLoading(true);
    try {
      const response = await api.credentials.getAll();
      if (response.success) {
        setTemplates(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load credential templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingTemplate(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (template: CredentialTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue(template);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    if (!api) return;

    try {
      const response = await api.credentials.delete(id);
      if (response.success) {
        message.success(t.settings.credentialDeleted);
        loadTemplates();
      } else {
        message.error(response.error || 'Failed to delete template');
      }
    } catch (error) {
      message.error('Failed to delete template');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (!api) return;

      if (editingTemplate) {
        const response = await api.credentials.update(editingTemplate.id!, values);
        if (response.success) {
          message.success(t.settings.credentialUpdated);
          loadTemplates();
          setModalVisible(false);
        } else {
          message.error(response.error || 'Failed to update template');
        }
      } else {
        const response = await api.credentials.add(values);
        if (response.success) {
          message.success(t.settings.credentialAdded);
          loadTemplates();
          setModalVisible(false);
        } else {
          message.error(response.error || 'Failed to add template');
        }
      }
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  const columns = [
    {
      title: t.settings.credentialName,
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t.settings.credentialLogin,
      dataIndex: 'login',
      key: 'login',
    },
    {
      title: t.settings.credentialPassword,
      dataIndex: 'password',
      key: 'password',
      render: (text: string) => '•'.repeat(Math.min(text.length, 12)),
    },
    {
      title: t.common.actions,
      key: 'actions',
      width: 120,
      render: (_: any, record: CredentialTemplate) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title={t.common.deleteConfirm}
            onConfirm={() => handleDelete(record.id!)}
            okText={t.common.yes}
            cancelText={t.common.no}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <KeyOutlined />
          {t.settings.credentials}
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          {t.settings.addCredential}
        </Button>
      }
    >
      <Table
        dataSource={templates}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={false}
        locale={{
          emptyText: t.settings.noCredentials,
        }}
      />

      <Modal
        title={editingTemplate ? t.settings.editCredential : t.settings.addCredential}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        okText={t.common.save}
        cancelText={t.common.cancel}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t.settings.credentialName}
            rules={[{ required: true, message: 'Please enter template name' }]}
          >
            <Input placeholder="e.g. Camera Default" />
          </Form.Item>

          <Form.Item
            name="login"
            label={t.settings.credentialLogin}
            rules={[{ required: true, message: 'Please enter login' }]}
          >
            <Input placeholder="e.g. admin" />
          </Form.Item>

          <Form.Item
            name="password"
            label={t.settings.credentialPassword}
            rules={[{ required: true, message: 'Please enter password' }]}
          >
            <Input.Password placeholder="••••••••" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
