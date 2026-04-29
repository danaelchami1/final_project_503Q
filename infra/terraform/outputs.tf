output "cluster_name" {
  value = aws_eks_cluster.shopcloud.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.shopcloud.endpoint
}