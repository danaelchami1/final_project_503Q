data "aws_iam_role" "eks_role_existing" {
  name = "eks-cluster-role"
}

resource "aws_iam_role_policy_attachment" "eks_policy" {
  role       = data.aws_iam_role.eks_role_existing.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_eks_cluster" "shopcloud" {
  name                          = var.cluster_name
  role_arn                      = data.aws_iam_role.eks_role_existing.arn
  bootstrap_self_managed_addons = false

  access_config {
    authentication_mode                         = "CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids = [
      aws_subnet.private_1.id,
      aws_subnet.private_2.id
    ]
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_policy
  ]

  tags = local.common_tags
}

data "aws_iam_role" "node_role_existing" {
  name = "eks-node-role"
}

resource "aws_iam_role_policy_attachment" "node_policy" {
  role       = data.aws_iam_role.node_role_existing.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  role       = data.aws_iam_role.node_role_existing.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "node_registry" {
  role       = data.aws_iam_role.node_role_existing.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_eks_node_group" "nodes" {
  cluster_name    = aws_eks_cluster.shopcloud.name
  node_group_name = var.node_group_name
  node_role_arn   = data.aws_iam_role.node_role_existing.arn
  subnet_ids = [
    aws_subnet.private_1.id,
    aws_subnet.private_2.id
  ]

  scaling_config {
    desired_size = var.node_desired_size
    max_size     = var.node_max_size
    min_size     = var.node_min_size
  }

  instance_types = var.node_instance_types

  depends_on = [
    aws_iam_role_policy_attachment.node_policy,
    aws_iam_role_policy_attachment.node_cni,
    aws_iam_role_policy_attachment.node_registry
  ]

  tags = local.common_tags
}
